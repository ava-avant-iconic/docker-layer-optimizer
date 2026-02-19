/**
 * Cache Optimization Rules Engine
 * Detects and suggests cache improvements for Dockerfiles
 */

export class CacheOptimizer {
  constructor(parsedStages) {
    this.stages = parsedStages;
    this.suggestions = [];
  }

  analyze() {
    this.suggestions = [];

    for (const stage of this.stages) {
      this.analyzeStage(stage);
    }

    return {
      suggestionCount: this.suggestions.length,
      suggestions: this.suggestions,
      byStage: this.groupByStage()
    };
  }

  analyzeStage(stage) {
    const instructions = stage.instructions;
    let hasPackageJson = false;
    let packageJsonLine = -1;
    let hasCopySource = false;
    let hasInstall = false;
    let hasCopyAll = false;

    for (let i = 0; i < instructions.length; i++) {
      const instr = instructions[i];
      const content = instr.content.toLowerCase();

      // Detect package.json COPY
      if ((instr.type === 'COPY' || instr.type === 'ADD') && 
          (content.includes('package.json') || content.includes('requirements.txt'))) {
        hasPackageJson = true;
        packageJsonLine = instr.lineNumber;
        hasCopySource = true;

        // Check if copying only dep files
        if (!content.includes('--from=') && !content.includes('*.json') && !content.includes('*.txt')) {
          this.suggestions.push({
            type: 'COPY_DEPS_ONLY',
            severity: 'high',
            stage: stage.name,
            lineNumber: instr.lineNumber,
            instruction: instr.raw,
            message: `Copy only dependency files (package.json, package-lock.json) before installing dependencies`,
            suggestion: `COPY package.json package-lock.json ./`,
            impact: 'Better cache invalidation - deps reinstall only when package files change'
          });
        }
      }

      // Detect COPY . . or COPY all source
      if ((instr.type === 'COPY' || instr.type === 'ADD') && 
          (content === '.' || content.includes(' ./'))) {
        hasCopyAll = true;
        
        if (hasInstall && !hasPackageJson) {
          this.suggestions.push({
            type: 'COPY_SOURCE_BEFORE_DEPS',
            severity: 'high',
            stage: stage.name,
            lineNumber: instr.lineNumber,
            instruction: instr.raw,
            message: 'Copying all source before installing dependencies',
            suggestion: 'COPY package.json package-lock.json ./\nRUN npm install\nCOPY . .',
            impact: 'Invalidates dependency cache on any source code change'
          });
        }
      }

      // Detect npm/yarn/pip install
      if (instr.type === 'RUN' && 
          (content.includes('npm install') || content.includes('yarn install') || 
           content.includes('pip install') || content.includes('poetry install'))) {
        hasInstall = true;

        // Check if install happens before copying source
        if (!hasCopyAll && hasCopySource) {
          // This is good - verify it's after package.json copy
          if (hasPackageJson && packageJsonLine < instr.lineNumber) {
            // Good pattern, but could suggest production-only
            if (!content.includes('--only=prod') && !content.includes('--production') && 
                !content.includes('--no-dev') && !content.includes('--no-dev')) {
              this.suggestions.push({
                type: 'PROD_DEPS_ONLY',
                severity: 'medium',
                stage: stage.name,
                lineNumber: instr.lineNumber,
                instruction: instr.raw,
                message: 'Installing all dependencies including devDependencies',
                suggestion: content.replace('npm install', 'npm install --only=prod')
                                     .replace('yarn install', 'yarn install --production')
                                     .replace('pip install', 'pip install --no-deps'),
                impact: 'Smaller production images'
              });
            }
          }
        }

        // Check for multi-line RUN that could be split for better caching
        if (content.includes('&&')) {
          const parts = content.split('&&').map(p => p.trim());
          if (parts.length > 2) {
            this.suggestions.push({
              type: 'SPLIT_LONG_RUN',
              severity: 'low',
              stage: stage.name,
              lineNumber: instr.lineNumber,
              instruction: instr.raw,
              message: 'Long RUN command with multiple steps',
              suggestion: parts.slice(0, 2).join(' && \\\n    ') + (parts.length > 2 ? '\n# Consider splitting into separate RUN layers' : ''),
              impact: 'Better cache granularity - each step can be cached separately'
            });
          }
        }
      }

      // Detect multiple apt-get/apk add in same stage
      if (instr.type === 'RUN' && (content.includes('apt-get install') || content.includes('apk add'))) {
        const packageList = content.match(/(apt-get install|apk add)\s+(.+?)(\s+&&|\s*$)/i);
        if (packageList) {
          const packages = packageList[2].split(/\s+/).filter(p => p && !p.startsWith('-'));
          if (packages.length > 5) {
            this.suggestions.push({
              type: 'TOO_MANY_PACKAGES',
              severity: 'medium',
              stage: stage.name,
              lineNumber: instr.lineNumber,
              instruction: instr.raw,
              message: `Installing ${packages.length} packages in one layer`,
              suggestion: 'Consider splitting into separate RUN layers for frequently vs rarely changing packages',
              impact: 'Better cache - reinstall only when needed packages change'
            });
          }
        }
      }

      // Detect WORKDIR after COPY/RUN
      if (instr.type === 'WORKDIR') {
        const prevInstrs = instructions.slice(0, i);
        const hasWorkdirUser = prevInstrs.some(p => p.type === 'COPY' || p.type === 'RUN');
        if (hasWorkdirUser) {
          this.suggestions.push({
            type: 'WORKDIR_POSITION',
            severity: 'low',
            stage: stage.name,
            lineNumber: instr.lineNumber,
            instruction: instr.raw,
            message: 'WORKDIR defined after COPY/RUN operations',
            suggestion: 'Move WORKDIR to the beginning of the stage',
            impact: 'Consistent directory context throughout'
          });
        }
      }

      // Detect missing .dockerignore
      if (instr.type === 'COPY' && content.includes('.') && !this.hasDockerignore()) {
        this.suggestions.push({
          type: 'DOCKERIGNORE',
          severity: 'medium',
          stage: stage.name,
          lineNumber: instr.lineNumber,
          instruction: instr.raw,
          message: 'Using COPY . . without .dockerignore',
          suggestion: 'Create .dockerignore to exclude unnecessary files (node_modules, .git, etc.)',
          impact: 'Smaller context, faster builds, less cache invalidation'
        });
      }
    }
  }

  hasDockerignore() {
    try {
      const { readFileSync } = await import('fs');
      readFileSync('.dockerignore');
      return true;
    } catch {
      return false;
    }
  }

  groupByStage() {
    const grouped = {};
    for (const suggestion of this.suggestions) {
      if (!grouped[suggestion.stage]) {
        grouped[suggestion.stage] = [];
      }
      grouped[suggestion.stage].push(suggestion);
    }
    return grouped;
  }

  /**
   * Generate a diff view showing before/after
   */
  generateDiff() {
    const diff = {
      stages: []
    };

    for (const stage of this.stages) {
      const stageSuggestions = this.suggestions.filter(s => s.stage === stage.name);
      
      if (stageSuggestions.length === 0) {
        diff.stages.push({
          name: stage.name,
          changes: [],
          unchanged: true
        });
        continue;
      }

      const changes = stageSuggestions.map(s => ({
        lineNumber: s.lineNumber,
        type: s.type,
        severity: s.severity,
        original: s.instruction,
        suggested: s.suggestion,
        message: s.message,
        impact: s.impact
      }));

      diff.stages.push({
        name: stage.name,
        changes,
        unchanged: false
      });
    }

    return diff;
  }
}
