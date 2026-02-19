/**
 * Tests for DockerfileParser
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { DockerfileParser } = require('../src/dockerfile-parser');

describe('DockerfileParser', () => {
  it('should parse a simple Dockerfile', () => {
    const content = `FROM node:18
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
CMD ["node", "index.js"]`;

    const parser = new DockerfileParser(content);

    assert.strictEqual(parser.getInstructions().length, 5);
    assert.strictEqual(parser.getStages().length, 1);
    assert.strictEqual(parser.isMultiStage(), false);
  });

  it('should detect multi-stage builds', () => {
    const content = `FROM node:18 AS builder
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
CMD ["node", "dist/index.js"]`;

    const parser = new DockerfileParser(content);

    assert.strictEqual(parser.getStages().length, 2);
    assert.strictEqual(parser.isMultiStage(), true);
  });

  it('should extract RUN instructions', () => {
    const content = `FROM node:18
RUN npm install
RUN npm run build
CMD ["node", "index.js"]`;

    const parser = new DockerfileParser(content);
    const runs = parser.getRunInstructions();

    assert.strictEqual(runs.length, 2);
    assert.strictEqual(runs[0].directive, 'RUN');
    assert.strictEqual(runs[0].lineNum, 2);
  });

  it('should extract COPY instructions', () => {
    const content = `FROM node:18
COPY package.json .
COPY . .`;

    const parser = new DockerfileParser(content);
    const copies = parser.getCopyInstructions();

    assert.strictEqual(copies.length, 2);
  });

  it('should parse FROM with AS clause', () => {
    const content = `FROM node:18 AS builder`;

    const parser = new DockerfileParser(content);
    const stages = parser.getStages();

    assert.strictEqual(stages[0].name, 'builder');
    assert.strictEqual(stages[0].as, 'builder');
  });

  it('should analyze layers correctly', () => {
    const content = `FROM node:18
RUN npm install
COPY . .
RUN npm run build
COPY package.json .`;

    const parser = new DockerfileParser(content);
    const analysis = parser.analyzeLayers();

    assert.strictEqual(analysis.totalInstructions, 5);
    assert.strictEqual(analysis.layers.run, 2);
    assert.strictEqual(analysis.layers.copy, 2);
  });

  it('should handle comments and empty lines', () => {
    const content = `# This is a comment
FROM node:18

WORKDIR /app

# Another comment
COPY . .`;

    const parser = new DockerfileParser(content);
    const instructions = parser.getInstructions();

    assert.strictEqual(instructions.length, 3);
    assert.strictEqual(instructions[0].directive, 'FROM');
    assert.strictEqual(instructions[1].directive, 'WORKDIR');
    assert.strictEqual(instructions[2].directive, 'COPY');
  });
});
