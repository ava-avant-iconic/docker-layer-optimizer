/**
 * Cache Optimization Rules Engine
 * Applies best practices to identify cache optimization opportunities
 */

class CacheRulesEngine {
  constructor() {
    this.rules = [
      this.packageInstallCombined,
      this.runCleaned,
      this.copyOrder,
      this.addVsCopy,
      this.multiStage,
      this.dockerignore,
      this.layerOrder,
      this.aptUpdateTogether,
      this.npmCache,
      this.wildcardCopies
    ];
  }

  /**
   * Run all rules against a Dockerfile parser
   */
  analyze(parser) {
    const results = [];

    for (const rule of this.rules) {
      const result = rule.call(this, parser);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Rule: Package installation commands should be combined
   */
  packageInstallCombined(parser) {
    const runs = parser.getRunInstructions();
    const installRuns = runs.filter(r => {
      const args = r.arguments.toUpperCase();
      return args.includes('APT-GET INSTALL') || args.includes('YUM INSTALL') || args.includes('APK ADD');
    });

    if (installRuns.length === 0) {
      return null;
    }

    const issues = installRuns.map(run => ({
      lineNum: run.lineNum,
      instruction: run.raw
    }));

    return {
      rule: 'package-install-combined',
      severity: 'high',
      title: 'Combine package installations',
      description: 'Package installation commands should be combined into a single RUN layer to reduce image size and improve caching',
      recommendation: 'Combine all apt-get/yum/apk add commands into one RUN instruction',
      issues
    };
  }

  /**
   * Rule: RUN commands should clean up after themselves
   */
  runCleaned(parser) {
    const runs = parser.getRunInstructions();
    const issues = [];

    for (const run of runs) {
      const args = run.arguments.toUpperCase();

      // Check for apt-get without cleanup
      if (args.includes('APT-GET INSTALL') && !args.includes('RM -RF')) {
        issues.push({
          lineNum: run.lineNum,
          instruction: run.raw,
          reason: 'Missing cleanup after apt-get install'
        });
      }

      // Check for yum without cleanup
      if (args.includes('YUM INSTALL') && !args.includes('YUM CLEAN ALL')) {
        issues.push({
          lineNum: run.lineNum,
          instruction: run.raw,
          reason: 'Missing cleanup after yum install'
        });
      }
    }

    if (issues.length === 0) {
      return null;
    }

    return {
      rule: 'run-cleaned',
      severity: 'medium',
      title: 'Clean up package caches',
      description: 'Package managers leave cache files that increase image size. Clean them up in the same RUN layer.',
      recommendation: 'Add cleanup commands after package installations (e.g., apt-get clean, rm -rf /var/lib/apt/lists/*)',
      issues
    };
  }

  /**
   * Rule: COPY should be ordered by change frequency
   */
  copyOrder(parser) {
    const copies = parser.getCopyInstructions();
    const issues = [];

    if (copies.length < 2) {
      return null;
    }

    // Check if package.json is copied before source files
    const pkgIndex = copies.findIndex(c => c.arguments.includes('package.json'));
    const srcIndex = copies.findIndex(c => c.arguments.includes('.') || c.arguments.includes('src'));

    if (pkgIndex !== -1 && srcIndex !== -1 && pkgIndex > srcIndex) {
      issues.push({
        lineNum: srcIndex,
        instruction: copies[srcIndex].raw,
        reason: 'Source files copied before package.json (breaks cache)'
      });
    }

    if (issues.length === 0) {
      return null;
    }

    return {
      rule: 'copy-order',
      severity: 'high',
      title: 'Order COPY by change frequency',
      description: 'Copy files that change less frequently (like package.json) before files that change often (source code).',
      recommendation: 'Move package.json COPY before source file COPY to leverage Docker layer caching',
      issues
    };
  }

  /**
   * Rule: Prefer COPY over ADD
   */
  addVsCopy(parser) {
    const adds = parser.getAddInstructions();

    if (adds.length === 0) {
      return null;
    }

    const issues = adds.map(add => ({
      lineNum: add.lineNum,
      instruction: add.raw,
      suggestion: 'Consider using COPY instead unless you need ADD features (URL extraction, automatic tar extraction)'
    }));

    return {
      rule: 'add-vs-copy',
      severity: 'low',
      title: 'Prefer COPY over ADD',
      description: 'ADD has automatic features that can be surprising. COPY is more explicit and predictable.',
      recommendation: 'Use COPY for local files. Only use ADD when you need URL downloading or automatic extraction.',
      issues
    };
  }

  /**
   * Rule: Use multi-stage builds for smaller images
   */
  multiStage(parser) {
    if (parser.isMultiStage()) {
      return null;
    }

    const analysis = parser.analyzeLayers();

    // Only suggest if there are build tools or dev dependencies
    const hasBuildTools = parser.instructions.some(i => {
      const args = i.arguments.toUpperCase();
      return args.includes('BUILD-ESSENTIAL') || args.includes('GCC') || args.includes('MAKE');
    });

    if (!hasBuildTools) {
      return null;
    }

    return {
      rule: 'multi-stage',
      severity: 'medium',
      title: 'Consider multi-stage builds',
      description: 'Multi-stage builds can significantly reduce final image size by excluding build tools and dependencies.',
      recommendation: 'Split your Dockerfile into build and runtime stages, copying only necessary artifacts.',
      issues: [{
        lineNum: 1,
        instruction: 'Single-stage build',
        reason: 'Build tools are included in final image'
      }]
    };
  }

  /**
   * Rule: Use .dockerignore to exclude unnecessary files
   */
  dockerignore(parser) {
    // This is a warning rule since we can't check if .dockerignore exists
    return {
      rule: 'dockerignore',
      severity: 'low',
      title: 'Use .dockerignore file',
      description: 'A .dockerignore file prevents unnecessary files from being sent to the Docker daemon, improving build speed.',
      recommendation: 'Create a .dockerignore file to exclude node_modules, .git, and other unnecessary files.',
      issues: []
    };
  }

  /**
   * Rule: Order instructions to maximize cache hits
   */
  layerOrder(parser) {
    const instructions = parser.getInstructions();
    const issues = [];

    // Check if RUN apt-get update is separate from install
    for (let i = 0; i < instructions.length - 1; i++) {
      const current = instructions[i];
      const next = instructions[i + 1];

      if (current.directive === 'RUN' && current.arguments.toUpperCase().includes('APT-GET UPDATE') &&
          next.directive !== 'RUN' || !next.arguments.toUpperCase().includes('APT-GET INSTALL')) {
        issues.push({
          lineNum: current.lineNum,
          instruction: current.raw,
          reason: 'apt-get update should be in same layer as install'
        });
      }
    }

    if (issues.length === 0) {
      return null;
    }

    return {
      rule: 'layer-order',
      severity: 'medium',
      title: 'Combine update and install',
      description: 'apt-get update and apt-get install should be in the same RUN layer to prevent cached updates from going stale.',
      recommendation: 'Combine apt-get update && apt-get install in one RUN command with &&',
      issues
    };
  }

  /**
   * Rule: Keep apt-get update together
   */
  aptUpdateTogether(parser) {
    const runs = parser.getRunInstructions();
    const updates = runs.filter(r => r.arguments.toUpperCase().includes('APT-GET UPDATE'));
    const installs = runs.filter(r => r.arguments.toUpperCase().includes('APT-GET INSTALL'));

    if (updates.length !== installs.length && updates.length > 0) {
      return {
        rule: 'apt-update-together',
        severity: 'medium',
        title: 'Mismatched update and install',
        description: 'apt-get update should be paired with apt-get install in the same RUN layer.',
        recommendation: 'Combine apt-get update and install commands with &&',
        issues: updates.map(u => ({
          lineNum: u.lineNum,
          instruction: u.raw,
          reason: 'Update without corresponding install'
        }))
      };
    }

    return null;
  }

  /**
   * Rule: Use npm cache mounts or specific cache strategies
   */
  npmCache(parser) {
    const runs = parser.getRunInstructions();
    const npmInstalls = runs.filter(r => r.arguments.toUpperCase().includes('NPM INSTALL'));

    if (npmInstalls.length === 0) {
      return null;
    }

    const issues = npmInstalls.filter(r => !r.arguments.includes('--mount'));

    if (issues.length === 0) {
      return null;
    }

    return {
      rule: 'npm-cache',
      severity: 'low',
      title: 'Consider npm cache mounts',
      description: 'Using BuildKit cache mounts with npm install can significantly speed up builds.',
      recommendation: 'Add --mount=type=cache,target=/root/.npm to npm install commands (requires BuildKit)',
      issues: issues.map(i => ({
        lineNum: i.lineNum,
        instruction: i.raw,
        reason: 'Could benefit from cache mount'
      }))
    };
  }

  /**
   * Rule: Avoid wildcard copies
   */
  wildcardCopies(parser) {
    const copies = parser.getCopyInstructions();
    const issues = copies.filter(c => c.arguments.includes('*'));

    if (issues.length === 0) {
      return null;
    }

    return {
      rule: 'wildcard-copies',
      severity: 'low',
      title: 'Avoid wildcard COPY patterns',
      description: 'Wildcards in COPY can include unintended files and break cache invalidation.',
      recommendation: 'Specify exact file paths instead of using wildcards when possible.',
      issues: issues.map(i => ({
        lineNum: i.lineNum,
        instruction: i.raw,
        reason: 'Wildcard pattern may include unintended files'
      }))
    };
  }
}

module.exports = CacheRulesEngine;
