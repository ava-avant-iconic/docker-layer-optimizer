/**
 * Dockerfile Parser
 * Parses Dockerfiles and extracts structure including multi-stage builds
 */

class DockerfileParser {
  constructor(content) {
    this.content = content;
    this.lines = content.split('\n');
    this.stages = [];
    this.instructions = [];
    this.parse();
  }

  /**
   * Parse the Dockerfile content
   */
  parse() {
    let currentStage = { name: 'base', instructions: [], from: null };
    let stageIndex = 0;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i].trim();
      const lineNum = i + 1;

      // Skip empty lines and comments
      if (!line || line.startsWith('#')) {
        continue;
      }

      // Parse instruction
      const instruction = this.parseInstruction(line, lineNum);
      this.instructions.push(instruction);

      // Track FROM instructions for stage detection
      if (instruction.directive.toUpperCase() === 'FROM') {
        // If we already have a FROM, this is a new stage
        if (currentStage.from) {
          this.stages.push(currentStage);
          stageIndex++;
        }

        const stageInfo = this.parseFromInstruction(instruction);
        currentStage = {
          name: stageInfo.name || `stage_${stageIndex}`,
          from: stageInfo.base,
          as: stageInfo.as,
          instructions: [instruction]
        };
      } else {
        currentStage.instructions.push(instruction);
      }
    }

    // Push the last stage
    if (currentStage.from || currentStage.instructions.length > 0) {
      this.stages.push(currentStage);
    }
  }

  /**
   * Parse a single instruction line
   */
  parseInstruction(line, lineNum) {
    // Handle JSON array syntax (e.g., CMD ["executable", "param"])
    if (line.startsWith('[') && line.endsWith(']')) {
      return {
        directive: line.slice(0, line.indexOf('[')).trim().toUpperCase(),
        arguments: line.slice(line.indexOf('[')).trim(),
        raw: line,
        lineNum
      };
    }

    // Handle multi-line continuations (not fully implemented)
    if (line.endsWith('\\')) {
      return {
        directive: line.slice(0, line.indexOf(' ')).trim().toUpperCase(),
        arguments: line.slice(line.indexOf(' ') + 1, -1).trim(),
        raw: line,
        lineNum,
        continuation: true
      };
    }

    // Simple directive format
    const firstSpace = line.indexOf(' ');
    if (firstSpace === -1) {
      return {
        directive: line.toUpperCase(),
        arguments: '',
        raw: line,
        lineNum
      };
    }

    return {
      directive: line.slice(0, firstSpace).trim().toUpperCase(),
      arguments: line.slice(firstSpace + 1).trim(),
      raw: line,
      lineNum
    };
  }

  /**
   * Parse FROM instruction to extract base image and optional alias
   */
  parseFromInstruction(instruction) {
    const parts = instruction.arguments.split(/\s+/);
    const base = parts[0];

    let name = null;
    let as = null;

    // Check for AS clause
    const asIndex = parts.map(p => p.toUpperCase()).indexOf('AS');
    if (asIndex !== -1 && asIndex + 1 < parts.length) {
      as = parts[asIndex + 1];
      name = as;
    }

    return { base, as, name };
  }

  /**
   * Get all stages
   */
  getStages() {
    return this.stages;
  }

  /**
   * Get all instructions
   */
  getInstructions() {
    return this.instructions;
  }

  /**
   * Check if this is a multi-stage build
   */
  isMultiStage() {
    return this.stages.length > 1;
  }

  /**
   * Get instructions by directive type
   */
  getInstructionsByType(directive) {
    return this.instructions.filter(i => i.directive.toUpperCase() === directive.toUpperCase());
  }

  /**
   * Get RUN instructions
   */
  getRunInstructions() {
    return this.getInstructionsByType('RUN');
  }

  /**
   * Get COPY instructions
   */
  getCopyInstructions() {
    return this.getInstructionsByType('COPY');
  }

  /**
   * Get ADD instructions
   */
  getAddInstructions() {
    return this.getInstructionsByType('ADD');
  }

  /**
   * Analyze layer patterns
   */
  analyzeLayers() {
    const analysis = {
      totalInstructions: this.instructions.length,
      stages: this.stages.length,
      layers: {
        run: this.getRunInstructions().length,
        copy: this.getCopyInstructions().length,
        add: this.getAddInstructions().length,
        other: 0
      },
      potentialIssues: []
    };

    // Count other layers
    analysis.layers.other = analysis.totalInstructions - analysis.layers.run - analysis.layers.copy - analysis.layers.add;

    return analysis;
  }
}

module.exports = DockerfileParser;
