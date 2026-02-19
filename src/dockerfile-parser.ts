/**
 * Dockerfile Parser
 * Parses Dockerfiles and extracts layer information with multi-stage build detection
 */

export interface Layer {
  type: string;
  instruction: string;
  arguments: string[];
  from?: string;
  as?: string;
  stageName?: string;
  lineNumber: number;
  raw: string;
}

export interface Stage {
  name: string;
  from: string;
  as: string;
  layers: Layer[];
  startLineNumber: number;
}

export interface ParseResult {
  layers: Layer[];
  stages: Stage[];
  hasMultiStage: boolean;
  baseImages: string[];
}

export class DockerfileParser {
  private instructions: Set<string> = new Set([
    'FROM', 'RUN', 'CMD', 'LABEL', 'MAINTAINER', 'EXPOSE', 'ENV', 'ADD', 'COPY',
    'ENTRYPOINT', 'VOLUME', 'USER', 'WORKDIR', 'ARG', 'ONBUILD', 'STOPSIGNAL',
    'HEALTHCHECK', 'SHELL', 'ARG'
  ]);

  parse(dockerfileContent: string): ParseResult {
    const lines = dockerfileContent.split('\n');
    const layers: Layer[] = [];
    const stages: Stage[] = [];
    let currentStage: Stage | null = null;
    const baseImages = new Set<string>();

    let i = 0;
    while (i < lines.length) {
      let line = lines[i].trim();

      // Skip comments and empty lines
      if (!line || line.startsWith('#')) {
        i++;
        continue;
      }

      // Handle line continuation
      let fullLine = line;
      let lineNumber = i + 1;

      while (fullLine.endsWith('\\')) {
        fullLine = fullLine.slice(0, -1) + ' ';
        i++;
        if (i < lines.length) {
          const nextLine = lines[i].trim();
          // Skip comments and empty lines in continuation
          if (nextLine && !nextLine.startsWith('#')) {
            fullLine += nextLine;
          }
        }
      }

      const layer = this.parseLine(fullLine, lineNumber);
      if (layer) {
        layers.push(layer);

        // Track FROM instructions for stages
        if (layer.type === 'FROM') {
          const baseImage = layer.arguments[0]?.split(':')[0] || layer.arguments[0];
          baseImages.add(baseImage);

          const stage: Stage = {
            name: layer.as || `stage_${stages.length}`,
            from: layer.from || layer.arguments[0],
            as: layer.as || '',
            layers: [],
            startLineNumber: layer.lineNumber
          };
          stages.push(stage);
          currentStage = stage;
        } else if (currentStage) {
          currentStage.layers.push(layer);
        }
      }

      i++;
    }

    return {
      layers,
      stages,
      hasMultiStage: stages.length > 1,
      baseImages: Array.from(baseImages)
    };
  }

  private parseLine(line: string, lineNumber: number): Layer | null {
    const parts = line.split(/\s+/);
    const instruction = parts[0].toUpperCase();
    const args = parts.slice(1);

    if (!this.instructions.has(instruction)) {
      return null;
    }

    const layer: Layer = {
      type: instruction,
      instruction: parts[0],
      arguments: args,
      lineNumber,
      raw: line
    };

    // Parse FROM instruction
    if (instruction === 'FROM') {
      for (let i = 0; i < args.length; i++) {
        if (args[i].toUpperCase() === '--AS' || args[i].toUpperCase() === 'AS') {
          layer.as = args[i + 1];
          layer.stageName = args[i + 1];
        } else if (!layer.from && !args[i].startsWith('--')) {
          layer.from = args[i];
        }
      }
    }

    return layer;
  }

  analyzeLayers(parseResult: ParseResult): {
    totalLayers: number;
    layerTypes: Record<string, number>;
    potentialIssues: string[];
  } {
    const layerTypes: Record<string, number> = {};
    const potentialIssues: string[] = [];

    for (const layer of parseResult.layers) {
      layerTypes[layer.type] = (layerTypes[layer.type] || 0) + 1;
    }

    // Detect potential issues
    // 1. Too many RUN instructions (can be combined)
    const runCount = layerTypes['RUN'] || 0;
    if (runCount > 5) {
      potentialIssues.push(`High number of RUN instructions (${runCount}). Consider combining related commands.`);
    }

    // 2. Separate apt-get install/update
    for (let i = 0; i < parseResult.layers.length - 1; i++) {
      const current = parseResult.layers[i];
      const next = parseResult.layers[i + 1];

      if (current.type === 'RUN' && next.type === 'RUN') {
        const currentCmd = current.arguments.join(' ');
        const nextCmd = next.arguments.join(' ');

        if (currentCmd.includes('apt-get update') && nextCmd.includes('apt-get install')) {
          potentialIssues.push(
            `apt-get update and install are in separate layers (lines ${current.lineNumber}, ${next.lineNumber}). Combine them.`
          );
        }
      }
    }

    // 3. Large COPY/ADD without explicit layer break before
    for (let i = 1; i < parseResult.layers.length; i++) {
      const layer = parseResult.layers[i];
      const prev = parseResult.layers[i - 1];

      if ((layer.type === 'COPY' || layer.type === 'ADD') && prev.type !== 'RUN') {
        // Check if previous layer doesn't do cache prep
        potentialIssues.push(
          `${layer.type} at line ${layer.lineNumber} may benefit from cache-breaking RUN instruction before it.`
        );
      }
    }

    return {
      totalLayers: parseResult.layers.length,
      layerTypes,
      potentialIssues
    };
  }
}
