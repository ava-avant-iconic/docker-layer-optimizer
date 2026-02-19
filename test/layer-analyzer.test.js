/**
 * Tests for LayerAnalyzer
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { LayerAnalyzer } = require('../src/layer-analyzer');

describe('LayerAnalyzer', () => {
  it('should parse size strings correctly', () => {
    const analyzer = new LayerAnalyzer();

    assert.strictEqual(analyzer.parseSize('0B'), 0);
    assert.strictEqual(analyzer.parseSize('100B'), 100);
    assert.strictEqual(analyzer.parseSize('1KB'), 1024);
    assert.strictEqual(analyzer.parseSize('1MB'), 1024 * 1024);
    assert.strictEqual(analyzer.parseSize('1GB'), 1024 * 1024 * 1024);
  });

  it('should format bytes correctly', () => {
    const analyzer = new LayerAnalyzer();

    assert.strictEqual(analyzer.formatBytes(0), '0B');
    assert.strictEqual(analyzer.formatBytes(100), '100.00B');
    assert.strictEqual(analyzer.formatBytes(1024), '1.00KB');
    assert.strictEqual(analyzer.formatBytes(1024 * 1024), '1.00MB');
    assert.strictEqual(analyzer.formatBytes(1024 * 1024 * 1024), '1.00GB');
  });

  it('should parse docker history output', () => {
    const analyzer = new LayerAnalyzer();
    const output = `sha256:abc123|150MB|/bin/sh -c apt-get update && apt-get install -y curl
sha256:def456|50MB|COPY . /app
sha256:ghi789|10MB|RUN npm install`;

    const layers = analyzer.parseHistoryOutput(output);

    assert.strictEqual(layers.length, 3);
    assert.strictEqual(layers[0].id, 'sha256:abc123');
    assert.strictEqual(layers[1].size, 50 * 1024 * 1024);
  });

  it('should calculate total size', () => {
    const analyzer = new LayerAnalyzer();
    const output = `sha256:abc123|100MB|RUN npm install
sha256:def456|50MB|COPY . .`;

    analyzer.parseHistoryOutput(output);
    const total = analyzer.getTotalSize();

    assert.strictEqual(total, 150 * 1024 * 1024);
  });

  it('should find largest layers', () => {
    const analyzer = new LayerAnalyzer();
    const output = `sha256:abc123|100MB|RUN npm install
sha256:def456|200MB|COPY . .
sha256:ghi789|50MB|RUN npm run build
sha256:jkl012|10MB|CMD ["node"]`;

    analyzer.parseHistoryOutput(output);
    const largest = analyzer.getLargestLayers(2);

    assert.strictEqual(largest.length, 2);
    assert.strictEqual(largest[0].size, 200 * 1024 * 1024);
    assert.strictEqual(largest[1].size, 100 * 1024 * 1024);
  });

  it('should analyze layers and return summary', () => {
    const analyzer = new LayerAnalyzer();
    const output = `sha256:abc123|100MB|RUN npm install
sha256:def456|50MB|COPY . .`;

    analyzer.parseHistoryOutput(output);
    const analysis = analyzer.analyze();

    assert.strictEqual(analysis.totalLayers, 2);
    assert.strictEqual(analysis.totalSize, 150 * 1024 * 1024);
    assert.strictEqual(analysis.largestLayers.length, 2);
  });

  it('should estimate sizes from Dockerfile', () => {
    const analyzer = new LayerAnalyzer();
    const { DockerfileParser } = require('../src/dockerfile-parser');

    const content = `FROM node:18
RUN apt-get install -y curl
RUN npm install
COPY . .`;

    const parser = new DockerfileParser(content);
    const estimate = analyzer.estimateFromDockerfile(parser);

    assert.ok(estimate.totalEstimated > 0);
    assert.ok(estimate.estimates.length > 0);
    assert.ok(estimate.estimates[0].type === 'RUN');
  });

  it('should handle empty history output', () => {
    const analyzer = new LayerAnalyzer();
    analyzer.parseHistoryOutput('');

    assert.strictEqual(analyzer.layers.length, 0);
    assert.strictEqual(analyzer.getTotalSize(), 0);
  });
});
