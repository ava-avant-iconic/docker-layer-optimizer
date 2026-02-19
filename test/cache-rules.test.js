/**
 * Tests for CacheRulesEngine
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CacheRulesEngine } = require('../src/cache-rules');

describe('CacheRulesEngine', () => {
  const engine = new CacheRulesEngine();

  it('should detect uncombined package installations', () => {
    const content = `FROM node:18
RUN apt-get update && apt-get install -y curl
RUN apt-get install -y git
CMD ["node", "index.js"]`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const packageIssue = issues.find(i => i.rule === 'package-install-combined');
    assert.ok(packageIssue);
    assert.strictEqual(packageIssue.severity, 'high');
  });

  it('should detect missing cleanup after apt-get', () => {
    const content = `FROM node:18
RUN apt-get update && apt-get install -y curl
CMD ["node", "index.js"]`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const cleanupIssue = issues.find(i => i.rule === 'run-cleaned');
    assert.ok(cleanupIssue);
    assert.strictEqual(cleanupIssue.severity, 'medium');
  });

  it('should detect ADD vs COPY', () => {
    const content = `FROM node:18
ADD . /app
CMD ["node", "index.js"]`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const addIssue = issues.find(i => i.rule === 'add-vs-copy');
    assert.ok(addIssue);
    assert.strictEqual(addIssue.severity, 'low');
  });

  it('should suggest multi-stage builds for images with build tools', () => {
    const content = `FROM node:18
RUN apt-get install -y build-essential
RUN npm install
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const multiStageIssue = issues.find(i => i.rule === 'multi-stage');
    assert.ok(multiStageIssue);
    assert.strictEqual(multiStageIssue.severity, 'medium');
  });

  it('should detect wildcard COPY patterns', () => {
    const content = `FROM node:18
COPY src/*.js /app/
COPY dist/* /app/`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const wildcardIssue = issues.find(i => i.rule === 'wildcard-copies');
    assert.ok(wildcardIssue);
    assert.strictEqual(wildcardIssue.severity, 'low');
  });

  it('should not find issues in an optimized Dockerfile', () => {
    const content = `FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/index.js"]`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    // Should only have dockerignore warning
    const criticalIssues = issues.filter(i => i.severity === 'high' || i.severity === 'medium');
    assert.strictEqual(criticalIssues.length, 0);
  });

  it('should always suggest .dockerignore', () => {
    const content = `FROM node:18
COPY . .`;

    const { DockerfileParser } = require('../src/dockerfile-parser');
    const parser = new DockerfileParser(content);
    const issues = engine.analyze(parser);

    const dockerignoreIssue = issues.find(i => i.rule === 'dockerignore');
    assert.ok(dockerignoreIssue);
    assert.strictEqual(dockerignoreIssue.severity, 'low');
  });
});
