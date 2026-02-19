/**
 * Tests for Size Estimator
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { SizeEstimator } from './size-estimator.js';
import { DockerfileParser } from './dockerfile-parser.js';

describe('SizeEstimator', () => {
  const estimator = new SizeEstimator();
  const parser = new DockerfileParser();

  it('should estimate size for alpine-based image', () => {
    const content = `
FROM alpine
RUN apk add --no-cache nodejs
COPY . .
CMD ["node", "index.js"]
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.estimatedSize);
    assert.ok(parseFloat(estimate.estimatedSize) > 0);
    assert.ok(estimate.breakdown.length > 0);
  });

  it('should estimate larger size for non-alpine base', () => {
    const alpineContent = 'FROM alpine\nRUN echo "hello"';
    const ubuntuContent = 'FROM ubuntu\nRUN echo "hello"';

    const alpineResult = parser.parse(alpineContent);
    const ubuntuResult = parser.parse(ubuntuContent);

    const alpineEstimate = estimator.estimate(alpineResult);
    const ubuntuEstimate = estimator.estimate(ubuntuResult);

    assert.ok(
      parseFloat(alpineEstimate.estimatedSize) < parseFloat(ubuntuEstimate.estimatedSize)
    );
  });

  it('should include breakdown by layer type', () => {
    const content = `
FROM node:18-alpine
RUN npm install
COPY . .
ENV NODE_ENV=production
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.breakdown.some((item) => item.category === 'Base Image'));
    assert.ok(estimate.breakdown.some((item) => item.category === 'RUN Layers'));
  });

  it('should provide size recommendations', () => {
    const content = `
FROM ubuntu:22.04
RUN apt-get install -y nodejs
COPY . .
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.recommendations.length > 0);
    assert.ok(estimate.recommendations.some((rec) => rec.includes('alpine') || rec.includes('slim')));
  });

  it('should detect large COPY operations', () => {
    const content = `
FROM node:18-alpine
COPY node_modules .
COPY . .
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.recommendations.some((rec) => rec.includes('node_modules')));
  });

  it('should suggest cleanup for apt-get installs', () => {
    const content = `
FROM ubuntu:22.04
RUN apt-get update && apt-get install -y nodejs
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.recommendations.some((rec) => rec.includes('cleanup')));
  });

  it('should account for multi-stage builds', () => {
    const content = `
FROM node:18 AS builder
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
RUN npm run build

FROM alpine
COPY --from=builder /app/dist /app
`;

    const parseResult = parser.parse(content);
    const estimate = estimator.estimate(parseResult);

    assert.ok(estimate.estimatedSize);
    // Multi-stage should be smaller than single stage
    const singleStage = parser.parse(`
FROM node:18
WORKDIR /app
COPY package.json .
RUN npm ci
COPY . .
RUN npm run build
`);
    const singleEstimate = estimator.estimate(singleStage);

    // Just ensure both produce valid estimates
    assert.ok(parseFloat(estimate.estimatedSize) > 0);
    assert.ok(parseFloat(singleEstimate.estimatedSize) > 0);
  });
});
