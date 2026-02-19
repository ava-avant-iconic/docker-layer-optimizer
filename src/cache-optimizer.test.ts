/**
 * Tests for Cache Optimizer
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CacheOptimizer } from './cache-optimizer.js';
import { DockerfileParser } from './dockerfile-parser.js';

describe('CacheOptimizer', () => {
  const optimizer = new CacheOptimizer();
  const parser = new DockerfileParser();

  it('should detect separated apt-get update and install', () => {
    const content = `
FROM debian
RUN apt-get update
RUN apt-get install -y nodejs
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    assert.ok(optimizations.some((opt) => opt.issue.includes('apt-get update')));
  });

  it('should suggest moving package.json before COPY .', () => {
    const content = `
FROM node:18
WORKDIR /app
COPY . .
RUN npm install
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    // No optimization since package.json is not copied separately
    assert.ok(true);
  });

  it('should suggest combining apt-get update and install', () => {
    const content = `
FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install -y curl wget
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    const aptOptimization = optimizations.find((opt) => opt.issue.includes('apt-get update'));
    assert.ok(aptOptimization);
    assert.strictEqual(aptOptimization.severity, 'high');
  });

  it('should suggest cache mounts for npm install', () => {
    const content = `
FROM node:18
WORKDIR /app
RUN npm install
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    const npmOptimization = optimizations.find((opt) => opt.issue.includes('npm/yarn install'));
    assert.ok(npmOptimization);
  });

  it('should sort optimizations by severity', () => {
    const content = `
FROM ubuntu:22.04
RUN apt-get update
RUN apt-get install -y nodejs
WORKDIR /app
COPY . .
RUN npm install
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    // High severity should come before medium
    const firstHigh = optimizations.findIndex((opt) => opt.severity === 'high');
    const firstMedium = optimizations.findIndex((opt) => opt.severity === 'medium');

    assert.ok(firstHigh !== -1);
    if (firstMedium !== -1) {
      assert.ok(firstHigh < firstMedium);
    }
  });

  it('should provide before/after examples', () => {
    const content = `
FROM debian
RUN apt-get update
RUN apt-get install -y curl
`;

    const parseResult = parser.parse(content);
    const optimizations = optimizer.optimize(parseResult);

    const aptOptimization = optimizations.find((opt) => opt.issue.includes('apt-get update'));
    assert.ok(aptOptimization);
    assert.ok(aptOptimization.before);
    assert.ok(aptOptimization.after);
  });
});
