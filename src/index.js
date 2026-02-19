/**
 * Main entry point
 */

const Analyzer = require('./analyzer');

module.exports = {
  Analyzer,
  DockerfileParser: require('./dockerfile-parser'),
  LayerAnalyzer: require('./layer-analyzer'),
  CacheRulesEngine: require('./cache-rules')
};
