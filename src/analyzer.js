/**
 * Main Analyzer
 * Combines parser, layer analyzer, and cache rules
 */

const DockerfileParser = require('./dockerfile-parser');
const LayerAnalyzer = require('./layer-analyzer');
const CacheRulesEngine = require('./cache-rules');

class Analyzer {
  constructor(dockerfilePath) {
    this.dockerfilePath = dockerfilePath;
    this.dockerfile = null;
    this.parser = null;
    this.layerAnalyzer = new LayerAnalyzer();
    this.cacheRules = new CacheRulesEngine();
  }

  /**
   * Load Dockerfile from disk
   */
  async load() {
    const fs = require('fs').promises;

    try {
      const content = await fs.readFile(this.dockerfilePath, 'utf-8');
      this.dockerfile = content;
      this.parser = new DockerfileParser(content);
      return true;
    } catch (error) {
      throw new Error(`Failed to load Dockerfile: ${error.message}`);
    }
  }

  /**
   * Parse Dockerfile from string
   */
  parse(content) {
    this.dockerfile = content;
    this.parser = new DockerfileParser(content);
    return this;
  }

  /**
   * Analyze the Dockerfile
   */
  analyze(options = {}) {
    if (!this.parser) {
      throw new Error('Dockerfile not loaded. Call load() or parse() first.');
    }

    const results = {
      summary: {
        totalInstructions: 0,
        stages: 0,
        isMultiStage: false,
        issues: { high: 0, medium: 0, low: 0 }
      },
      structure: null,
      cacheIssues: null,
      layerEstimate: null
    };

    // Analyze structure
    results.structure = this.parser.analyzeLayers();
    results.summary.totalInstructions = results.structure.totalInstructions;
    results.summary.stages = results.structure.stages;
    results.summary.isMultiStage = this.parser.isMultiStage();

    // Run cache rules
    results.cacheIssues = this.cacheRules.analyze(this.parser);

    // Count issues by severity
    for (const issue of results.cacheIssues) {
      results.summary.issues[issue.severity]++;
    }

    // Estimate layer sizes
    if (options.estimateSizes) {
      results.layerEstimate = this.layerAnalyzer.estimateFromDockerfile(this.parser);
    }

    return results;
  }

  /**
   * Analyze from Docker history output
   */
  analyzeFromHistory(historyOutput) {
    this.layerAnalyzer.parseHistoryOutput(historyOutput);
    return this.layerAnalyzer.analyze();
  }

  /**
   * Generate optimization suggestions
   */
  generateSuggestions() {
    if (!this.parser) {
      throw new Error('Dockerfile not loaded. Call load() or parse() first.');
    }

    const results = this.analyze();
    const suggestions = [];

    // Sort issues by severity
    const sortedIssues = [...results.cacheIssues].sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    for (const issue of sortedIssues) {
      suggestions.push({
        severity: issue.severity,
        title: issue.title,
        description: issue.description,
        recommendation: issue.recommendation,
        lines: issue.issues.map(i => i.lineNum)
      });
    }

    return suggestions;
  }

  /**
   * Get parser instance
   */
  getParser() {
    return this.parser;
  }

  /**
   * Get layer analyzer instance
   */
  getLayerAnalyzer() {
    return this.layerAnalyzer;
  }
}

module.exports = Analyzer;
