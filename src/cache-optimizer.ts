/**
 * Cache Optimization Rules Engine
 * Analyzes Dockerfile layers and suggests cache optimization improvements
 */

import { Layer, ParseResult } from './dockerfile-parser.js';

export interface CacheOptimization {
  lineNumber: number;
  severity: 'high' | 'medium' | 'low';
  issue: string;
  suggestion: string;
  before?: string;
  after?: string;
}

export class CacheOptimizer {
  private rules: CacheRule[] = [
    this.combineAptGetUpdateInstall,
    this.movePackageJsonEarly,
    this.orderRunByStability,
    this.dockerignoreSuggestion,
    this.useBuildCacheMounts,
    this.splitLongRunCommands,
    this.useChainedDeps
  ];

  optimize(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    for (const rule of this.rules) {
      const results = rule.call(this, parseResult);
      optimizations.push(...results);
    }

    // Sort by severity (high first)
    optimizations.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return optimizations;
  }

  private combineAptGetUpdateInstall(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    for (let i = 0; i < parseResult.layers.length - 1; i++) {
      const current = parseResult.layers[i];
      const next = parseResult.layers[i + 1];

      if (current.type === 'RUN' && next.type === 'RUN') {
        const currentCmd = current.arguments.join(' ');
        const nextCmd = next.arguments.join(' ');

        if (
          currentCmd.includes('apt-get update') &&
          !currentCmd.includes('apt-get install') &&
          (nextCmd.includes('apt-get install') || nextCmd.includes('apt-get'))
        ) {
          optimizations.push({
            lineNumber: current.lineNumber,
            severity: 'high',
            issue: 'apt-get update and install are in separate layers',
            suggestion:
              'Combine update and install into a single RUN to prevent cache invalidation issues',
            before: `${current.raw}\n${next.raw}`,
            after: `RUN apt-get update && apt-get install -y ${nextCmd.match(/apt-get install -y (.+)/)?.[1] || ''} \\\n    && rm -rf /var/lib/apt/lists/*`
          });
        }
      }
    }

    return optimizations;
  }

  private movePackageJsonEarly(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];
    const copyLayer = parseResult.layers.find((l) => l.type === 'COPY' && l.arguments.includes('package*.json'));

    if (!copyLayer) {
      return optimizations;
    }

    // Check if COPY package.json comes before COPY . or COPY *
    const copyDotIndex = parseResult.layers.findIndex(
      (l) => l.type === 'COPY' && (l.arguments.includes('.') || l.arguments.includes('*'))
    );
    const copyPkgIndex = parseResult.layers.indexOf(copyLayer);

    if (copyPkgIndex > -1 && copyDotIndex > -1 && copyPkgIndex > copyDotIndex) {
      optimizations.push({
        lineNumber: copyDotIndex,
        severity: 'high',
        issue: 'All source files are copied before package.json',
        suggestion:
          'Copy package.json first, then install dependencies, then copy the rest. This maximizes layer caching.',
        before: copyLayer.raw,
        after: 'COPY package*.json ./\nRUN npm ci --only=production\nCOPY . .'
      });
    }

    return optimizations;
  }

  private orderRunByStability(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];
    const envLayers = parseResult.layers.filter((l) => l.type === 'ENV');

    // Check if ENV comes after RUN (which might invalidate it)
    for (const envLayer of envLayers) {
      const envIndex = parseResult.layers.indexOf(envLayer);
      const hasRunAfter = parseResult.layers
        .slice(envIndex + 1)
        .some((l) => l.type === 'RUN' && l.arguments.join(' ').includes('${') || l.arguments.join(' ').includes('$'));

      if (hasRunAfter) {
        optimizations.push({
          lineNumber: envLayer.lineNumber,
          severity: 'medium',
          issue: 'ENV instruction may be overridden by subsequent RUN commands',
          suggestion:
            'Move ENV declarations after all RUN commands that modify environment, or use ARG for build-time values',
          before: envLayer.raw,
          after: `# Move this ENV after RUN if it should be runtime-only\n${envLayer.raw}`
        });
      }
    }

    return optimizations;
  }

  private dockerignoreSuggestion(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    // Check for COPY . . which suggests dockerignore is important
    const copyDot = parseResult.layers.find((l) => l.type === 'COPY' && l.arguments.includes('.'));
    if (copyDot && !parseResult.layers.some((l) => l.raw.includes('dockerignore'))) {
      optimizations.push({
        lineNumber: copyDot.lineNumber,
        severity: 'medium',
        issue: 'Using COPY . . without verifying .dockerignore',
        suggestion:
          'Create a .dockerignore file to exclude unnecessary files (node_modules, .git, etc.) to reduce context size',
        before: copyDot.raw,
        after: '# Add .dockerignore with: node_modules, .git, npm-debug.log, etc.\n' + copyDot.raw
      });
    }

    return optimizations;
  }

  private useBuildCacheMounts(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    for (const layer of parseResult.layers) {
      if (layer.type === 'RUN') {
        const cmd = layer.arguments.join(' ');
        const hasNpmOrYarn = cmd.includes('npm install') || cmd.includes('npm ci') || cmd.includes('yarn install');
        const hasCacheMount = cmd.includes('--mount=type=cache');

        if (hasNpmOrYarn && !hasCacheMount) {
          optimizations.push({
            lineNumber: layer.lineNumber,
            severity: 'medium',
            issue: 'npm/yarn install without cache mount',
            suggestion:
              'Use BuildKit cache mounts to persist package manager cache between builds',
            before: layer.raw,
            after: `RUN --mount=type=cache,target=/root/.npm npm ci --only=production`
          });
        }
      }
    }

    return optimizations;
  }

  private splitLongRunCommands(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    for (const layer of parseResult.layers) {
      if (layer.type === 'RUN') {
        const cmd = layer.arguments.join(' ');
        // Check if multiple distinct operations are in one RUN
        const hasAndThen = cmd.split(' && ').length > 3;

        if (hasAndThen) {
          const ops = cmd.split(' && ').map((s) => s.trim());
          // Check if operations could benefit from separate layers
          const hasIndependentOps = ops.some((op) => op.includes('install') || op.includes('download'));

          if (hasIndependentOps) {
            optimizations.push({
              lineNumber: layer.lineNumber,
              severity: 'low',
              issue: 'Many operations in a single RUN command',
              suggestion:
                'Consider splitting into multiple RUN layers for better cache granularity, especially for independent operations',
              before: layer.raw,
              after: '# Split into separate RUN layers for better caching\nRUN <operation-1>\nRUN <operation-2>'
            });
          }
        }
      }
    }

    return optimizations;
  }

  private useChainedDeps(parseResult: ParseResult): CacheOptimization[] {
    const optimizations: CacheOptimization[] = [];

    // Check if there are consecutive COPY instructions that could be combined
    let consecutiveCopy = 0;
    for (let layer of parseResult.layers) {
      if (layer.type === 'COPY') {
        consecutiveCopy++;
      } else if (consecutiveCopy > 1) {
        optimizations.push({
          lineNumber: layer.lineNumber - consecutiveCopy,
          severity: 'low',
          issue: `${consecutiveCopy} consecutive COPY instructions`,
          suggestion: 'Combine COPY instructions where possible to reduce layer count',
          before: '[multiple COPY lines]',
          after: 'COPY src1 src2 src3 dest/'
        });
        consecutiveCopy = 0;
      }
    }

    return optimizations;
  }
}

type CacheRule = (parseResult: ParseResult) => CacheOptimization[];
