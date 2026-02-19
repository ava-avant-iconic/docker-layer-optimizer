/**
 * Tests for Dockerfile Parser
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { DockerfileParser } from './dockerfile-parser.js';

describe('DockerfileParser', () => {
  const parser = new DockerfileParser();

  it('should parse a simple Dockerfile', () => {
    const content = `
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["node", "index.js"]
`;

    const result = parser.parse(content);

    assert.strictEqual(result.layers.length, 6);
    assert.strictEqual(result.hasMultiStage, false);
    assert.strictEqual(result.baseImages.length, 1);
    assert.strictEqual(result.baseImages[0], 'node');
  });

  it('should detect multi-stage builds', () => {
    const content = `
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
`;

    const result = parser.parse(content);

    assert.strictEqual(result.stages.length, 2);
    assert.strictEqual(result.hasMultiStage, true);
    assert.strictEqual(result.stages[0].as, 'builder');
  });

  it('should handle line continuations', () => {
    const content = `
FROM alpine
RUN apk add --no-cache \\
    git \\
    curl \\
    && rm -rf /var/cache/apk/*
`;

    const result = parser.parse(content);

    assert.strictEqual(result.layers.length, 2);
    assert.strictEqual(result.layers[1].type, 'RUN');
    assert.ok(result.layers[1].arguments.join(' ').includes('git'));
  });

  it('should analyze layers and detect issues', () => {
    const content = `
FROM debian
RUN apt-get update
RUN apt-get install -y nodejs
RUN apt-get install -y npm
`;

    const result = parser.parse(content);
    const analysis = parser.analyzeLayers(result);

    assert.strictEqual(analysis.totalLayers, 4);
    assert.ok(analysis.potentialIssues.length > 0);
    assert.ok(analysis.potentialIssues.some((issue) => issue.includes('apt-get update')));
  });

  it('should skip comments and empty lines', () => {
    const content = `
# This is a comment
FROM node:18

# Another comment

WORKDIR /app

RUN npm install
`;

    const result = parser.parse(content);

    assert.strictEqual(result.layers.length, 3);
  });

  it('should parse FROM with AS clause', () => {
    const content = 'FROM node:18-alpine AS builder';

    const result = parser.parse(content);

    assert.strictEqual(result.layers.length, 1);
    assert.strictEqual(result.layers[0].from, 'node:18-alpine');
    assert.strictEqual(result.layers[0].as, 'builder');
  });

  it('should collect base images', () => {
    const content = `
FROM node:18-alpine AS builder
FROM nginx:alpine
`;

    const result = parser.parse(content);

    assert.strictEqual(result.baseImages.length, 2);
    assert.ok(result.baseImages.includes('node'));
    assert.ok(result.baseImages.includes('nginx'));
  });
});
