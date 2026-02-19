/**
 * Docker Layer Optimizer
 * Main entry point for the library
 */

export { DockerfileParser, Layer, Stage, ParseResult } from './dockerfile-parser.js';
export { CacheOptimizer, CacheOptimization } from './cache-optimizer.js';
export { SizeEstimator, SizeEstimate, SizeBreakdown } from './size-estimator.js';

import { DockerfileParser } from './dockerfile-parser.js';
import { CacheOptimizer } from './cache-optimizer.js';
import { SizeEstimator } from './size-estimator.js';
import { readFileSync, existsSync } from 'fs';

export interface AnalysisResult {
  dockerfile: string;
  parseResult: any;
  layerAnalysis: any;
  cacheOptimizations: any[];
  sizeEstimate: any;
}

export class DockerLayerOptimizer {
  private parser: DockerfileParser;
  private cacheOptimizer: CacheOptimizer;
  private sizeEstimator: SizeEstimator;

  constructor() {
    this.parser = new DockerfileParser();
    this.cacheOptimizer = new CacheOptimizer();
    this.sizeEstimator = new SizeEstimator();
  }

  analyze(dockerfilePath: string): AnalysisResult {
    if (!existsSync(dockerfilePath)) {
      throw new Error(`Dockerfile not found: ${dockerfilePath}`);
    }

    const content = readFileSync(dockerfilePath, 'utf-8');
    return this.analyzeContent(content, dockerfilePath);
  }

  analyzeContent(dockerfileContent: string, filename: string = 'Dockerfile'): AnalysisResult {
    const parseResult = this.parser.parse(dockerfileContent);
    const layerAnalysis = this.parser.analyzeLayers(parseResult);
    const cacheOptimizations = this.cacheOptimizer.optimize(parseResult);
    const sizeEstimate = this.sizeEstimator.estimate(parseResult);

    return {
      dockerfile: filename,
      parseResult,
      layerAnalysis,
      cacheOptimizations,
      sizeEstimate
    };
  }
}
