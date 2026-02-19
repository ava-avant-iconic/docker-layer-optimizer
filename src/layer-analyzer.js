/**
 * Layer Size Analyzer
 * Analyzes layer sizes from Docker history output
 */

class LayerAnalyzer {
  constructor() {
    this.layers = [];
  }

  /**
   * Parse docker history output
   * Expected format from `docker history --no-trunc --format "{{.ID}}|{{.Size}}|{{.CreatedBy}}" <image>`
   */
  parseHistoryOutput(output) {
    const lines = output.trim().split('\n');
    this.layers = [];

    for (const line of lines) {
      const parts = line.split('|');
      if (parts.length >= 3) {
        this.layers.push({
          id: parts[0],
          size: this.parseSize(parts[1]),
          createdBy: parts[2]
        });
      }
    }

    return this.layers;
  }

  /**
   * Parse size string (e.g., "1.2GB", "500MB", "100KB") to bytes
   */
  parseSize(sizeStr) {
    if (!sizeStr || sizeStr === '0B') {
      return 0;
    }

    const sizeStrClean = sizeStr.trim().toUpperCase();
    const match = sizeStrClean.match(/^([\d.]+)\s*([KMGT]?B)$/i);

    if (!match) {
      return 0;
    }

    const value = parseFloat(match[1]);
    const unit = match[2];

    const units = {
      'B': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * * 3,
      'TB': 1024 ** 4
    };

    return value * (units[unit] || 1);
  }

  /**
   * Format bytes to human readable size
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(2)}${units[i]}`;
  }

  /**
   * Get total image size
   */
  getTotalSize() {
    return this.layers.reduce((sum, layer) => sum + layer.size, 0);
  }

  /**
   * Find largest layers
   */
  getLargestLayers(count = 5) {
    return [...this.layers]
      .sort((a, b) => b.size - a.size)
      .slice(0, count);
  }

  /**
   * Analyze layer composition
   */
  analyze() {
    const totalSize = this.getTotalSize();
    const largest = this.getLargestLayers(5);

    return {
      totalLayers: this.layers.length,
      totalSize,
      formattedTotalSize: this.formatBytes(totalSize),
      largestLayers: largest.map(layer => ({
        id: layer.id.substring(0, 12),
        size: layer.size,
        formattedSize: this.formatBytes(layer.size),
        percent: ((layer.size / totalSize) * 100).toFixed(2),
        createdBy: layer.createdBy
      })),
      averageLayerSize: totalSize / this.layers.length
    };
  }

  /**
   * Estimate size from Dockerfile (heuristic)
   * This is a rough estimate based on instruction types
   */
  estimateFromDockerfile(parser) {
    const analysis = parser.analyzeLayers();
    const estimates = [];

    // RUN commands: typically small (10-50KB) unless installing packages
    const runs = parser.getRunInstructions();
    for (const run of runs) {
      const args = run.arguments.toUpperCase();
      let estimated = 10 * 1024; // Default 10KB

      if (args.includes('APT-GET INSTALL') || args.includes('YUM INSTALL') || args.includes('APK ADD')) {
        estimated = 50 * 1024 * 1024; // Package install: ~50MB average
      } else if (args.includes('NPM INSTALL') || args.includes('PIP INSTALL')) {
        estimated = 20 * 1024 * 1024; // Package manager: ~20MB average
      } else if (args.includes('GIT CLONE') || args.includes('WGET') || args.includes('CURL')) {
        estimated = 100 * 1024 * 1024; // Downloads: ~100MB average
      }

      estimates.push({
        type: 'RUN',
        lineNum: run.lineNum,
        estimatedSize: estimated,
        formattedSize: this.formatBytes(estimated),
        reason: this.estimateReason(run.arguments)
      });
    }

    // COPY/ADD commands: depends on file size (unknown, estimate)
    const copies = [...parser.getCopyInstructions(), ...parser.getAddInstructions()];
    for (const copy of copies) {
      const estimated = 5 * 1024 * 1024; // Default 5MB estimate
      estimates.push({
        type: copy.directive,
        lineNum: copy.lineNum,
        estimatedSize: estimated,
        formattedSize: this.formatBytes(estimated),
        reason: 'Cannot determine without file access'
      });
    }

    return {
      totalEstimated: estimates.reduce((sum, e) => sum + e.estimatedSize, 0),
      formattedTotal: this.formatBytes(estimates.reduce((sum, e) => sum + e.estimatedSize, 0)),
      estimates
    };
  }

  /**
   * Get reason for size estimation
   */
  estimateReason(arguments) {
    const args = arguments.toUpperCase();

    if (args.includes('APT-GET INSTALL') || args.includes('YUM INSTALL') || args.includes('APK ADD')) {
      return 'Package installation';
    } else if (args.includes('NPM INSTALL') || args.includes('PIP INSTALL')) {
      return 'Dependency installation';
    } else if (args.includes('GIT CLONE') || args.includes('WGET') || args.includes('CURL')) {
      return 'Download operation';
    } else if (args.includes('MAKE') || args.includes('CMAKE') || args.includes('BUILD')) {
      return 'Build operation';
    } else {
      return 'Command execution';
    }
  }
}

module.exports = LayerAnalyzer;
