/**
 * Size Estimator
 * Estimates final image size based on Dockerfile analysis and heuristics
 */

import { Layer, ParseResult } from './dockerfile-parser.js';

export interface SizeEstimate {
  estimatedSize: string;
  breakdown: SizeBreakdown[];
  recommendations: string[];
}

export interface SizeBreakdown {
  category: string;
  estimatedSize: string;
  layers: number;
}

export class SizeEstimator {
  // Base image sizes (approximate, in MB)
  private baseImageSizes: Record<string, number> = {
    'alpine': 5,
    'debian': 80,
    'ubuntu': 72,
    'node': 180, // node:alpine
    'node:slim': 150,
    'node:alpine': 120,
    'python': 50, // python:alpine
    'python:slim': 120,
    'python:alpine': 45,
    'golang': 80, // golang:alpine
    'golang:alpine': 70,
    'openjdk': 80, // openjdk:slim
    'openjdk:alpine': 70
  };

  // Size impact per layer type (approximate, in MB)
  private layerSizeImpact: Record<string, number> = {
    'FROM': 0,
    'RUN': 50, // Highly variable
    'COPY': 30, // Depends on copied content
    'ADD': 35, // Can download larger files
    'ENV': 0.1,
    'ARG': 0.1,
    'WORKDIR': 0.1,
    'USER': 0.1,
    'EXPOSE': 0,
    'CMD': 0,
    'ENTRYPOINT': 0,
    'VOLUME': 0,
    'LABEL': 0.1,
    'MAINTAINER': 0.1,
    'ONBUILD': 0,
    'STOPSIGNAL': 0,
    'HEALTHCHECK': 1,
    'SHELL': 0.1
  };

  estimate(parseResult: ParseResult): SizeEstimate {
    const breakdown: SizeBreakdown[] = [];
    const recommendations: string[] = [];
    let totalSize = 0;

    // Base image size
    const baseImageSize = this.getBaseImageSize(parseResult.baseImages);
    totalSize += baseImageSize;

    breakdown.push({
      category: 'Base Image',
      estimatedSize: `${baseImageSize} MB`,
      layers: 1
    });

    // Size by layer type
    const layerTypeSizes: Record<string, { count: number; total: number }> = {};

    for (const layer of parseResult.layers) {
      if (!layerTypeSizes[layer.type]) {
        layerTypeSizes[layer.type] = { count: 0, total: 0 };
      }

      const size = this.estimateLayerSize(layer);
      layerTypeSizes[layer.type].count++;
      layerTypeSizes[layer.type].total += size;
      totalSize += size;
    }

    // Add breakdown for significant layer types
    const significantTypes = ['RUN', 'COPY', 'ADD'];
    for (const type of significantTypes) {
      if (layerTypeSizes[type]) {
        breakdown.push({
          category: `${type} Layers`,
          estimatedSize: `${layerTypeSizes[type].total.toFixed(1)} MB`,
          layers: layerTypeSizes[type].count
        });
      }
    }

    // Add "Other" category
    const otherSize = totalSize - baseImageSize - significantTypes.reduce((sum, type) => {
      return sum + (layerTypeSizes[type]?.total || 0);
    }, 0);
    if (otherSize > 0) {
      breakdown.push({
        category: 'Other Instructions',
        estimatedSize: `${otherSize.toFixed(1)} MB`,
        layers: parseResult.layers.length - significantTypes.reduce((sum, type) => {
          return sum + (layerTypeSizes[type]?.count || 0);
        }, 0)
      });
    }

    // Generate recommendations
    recommendations.push(...this.generateRecommendations(parseResult, layerTypeSizes));

    return {
      estimatedSize: `${totalSize.toFixed(0)} MB`,
      breakdown,
      recommendations
    };
  }

  private getBaseImageSize(baseImages: string[]): number {
    let size = 100; // Default fallback

    for (const image of baseImages) {
      const imageName = image.toLowerCase().split(':')[0];
      const tag = image.toLowerCase().split(':')[1] || '';

      // Check for alpine variants first
      if (tag.includes('alpine')) {
        const alpineSize = this.baseImageSizes[imageName + ':alpine'] || this.baseImageSizes['alpine'];
        size = Math.min(size, alpineSize);
        continue;
      }

      // Check for slim variants
      if (tag.includes('slim')) {
        const slimSize = this.baseImageSizes[imageName + ':slim'] || 80;
        size = Math.min(size, slimSize);
        continue;
      }

      // Use direct lookup or default
      size = Math.min(size, this.baseImageSizes[imageName] || 100);
    }

    return size;
  }

  private estimateLayerSize(layer: Layer): number {
    const baseSize = this.layerSizeImpact[layer.type] || 10;

    // Adjust based on layer arguments
    const args = layer.arguments.join(' ');

    // Large file operations
    if (layer.type === 'COPY' || layer.type === 'ADD') {
      if (args.includes('node_modules')) {
        return baseSize * 10; // node_modules are large
      }
      if (args.includes('*.tar') || args.includes('*.zip') || args.includes('*.tgz')) {
        return baseSize * 5;
      }
      if (args.includes('.') || args.includes('*')) {
        return baseSize * 2; // Copying everything is larger
      }
    }

    // Complex RUN commands
    if (layer.type === 'RUN') {
      if (args.includes('npm install') || args.includes('npm ci')) {
        return baseSize * 3; // Dependencies are large
      }
      if (args.includes('apt-get install') || args.includes('apk add')) {
        // Count packages
        const packageCount = (args.match(/\b[a-z][a-z0-9-]+\b/g) || []).length;
        return baseSize * Math.min(5, Math.max(1, packageCount / 5));
      }
      if (args.includes('pip install')) {
        return baseSize * 2;
      }
    }

    return baseSize;
  }

  private generateRecommendations(
    parseResult: ParseResult,
    layerTypeSizes: Record<string, { count: number; total: number }>
  ): string[] {
    const recommendations: string[] = [];

    // Check base image
    for (const image of parseResult.baseImages) {
      const imageName = image.toLowerCase().split(':')[0];
      const tag = image.toLowerCase().split(':')[1] || '';

      if (!tag.includes('alpine') && !tag.includes('slim') && imageName !== 'alpine') {
        recommendations.push(
          `Consider using an alpine or slim variant of ${imageName} to reduce base image size`
        );
      }
    }

    // Check for large COPY operations
    const copyLayers = parseResult.layers.filter((l) => l.type === 'COPY');
    for (const layer of copyLayers) {
      const args = layer.arguments.join(' ');
      if (args.includes('node_modules')) {
        recommendations.push(
          'Avoid copying node_modules - install them in the container to ensure platform compatibility'
        );
        break;
      }
      if (args.includes('.') || args.includes('*')) {
        recommendations.push(
          'Use .dockerignore to exclude unnecessary files (node_modules, .git, etc.) from COPY . .'
        );
        break;
      }
    }

    // Check for multi-stage build opportunities
    if (!parseResult.hasMultiStage && parseResult.layers.some((l) => l.type === 'RUN' && l.arguments.join(' ').includes('npm install'))) {
      recommendations.push(
        'Consider using multi-stage builds to exclude build tools and dev dependencies from the final image'
      );
    }

    // Check for cleanup in RUN commands
    const runLayers = parseResult.layers.filter((l) => l.type === 'RUN');
    const hasCleanup = runLayers.some(
      (l) =>
        l.arguments.join(' ').includes('rm -rf') ||
        l.arguments.join(' ').includes('apt-get clean') ||
        l.arguments.join(' ').includes('apk del')
    );

    if (!hasCleanup && runLayers.some((l) => l.arguments.join(' ').includes('apt-get install'))) {
      recommendations.push(
        'Add cleanup commands after package installation (e.g., `&& rm -rf /var/lib/apt/lists/*`)'
      );
    }

    return recommendations;
  }
}
