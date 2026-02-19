#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');
const chalk = require('chalk');
const { diffLines } = require('diff');
const { Analyzer } = require('../src/index');

/**
 * Print usage information
 */
function printUsage() {
  console.log(`
Docker Layer Optimizer v1.0.0

Analyzes Dockerfiles to identify inefficiencies in layer structure, caching, and image size.

USAGE:
  docker-layer-opt analyze <dockerfile> [options]

OPTIONS:
  --estimate, -e       Estimate layer sizes (heuristic)
  --format, -f <fmt>   Output format: json | text (default: text)
  --help, -h           Show this help message

EXAMPLES:
  docker-layer-opt analyze Dockerfile
  docker-layer-opt analyze Dockerfile --estimate
  docker-layer-opt analyze Dockerfile --format json

EXIT CODES:
  0 - Success
  1 - Error
  2 - Issues found (when used in CI)
`);
}

/**
 * Format severity with color
 */
function formatSeverity(severity) {
  const colors = {
    high: chalk.red.bold,
    medium: chalk.yellow.bold,
    low: chalk.blue.bold
  };
  return colors[severity] ? colors[severity](severity.toUpperCase()) : severity.toUpperCase();
}

/**
 * Print analysis results in text format
 */
function printTextResults(results, dockerfilePath) {
  console.log(chalk.bold.cyan(`\n🐳 Docker Layer Optimization Report`));
  console.log(chalk.gray(`File: ${dockerfilePath}\n`));

  // Summary
  console.log(chalk.bold('📊 Summary:'));
  console.log(`  Instructions: ${results.summary.totalInstructions}`);
  console.log(`  Stages: ${results.summary.stages}`);
  console.log(`  Multi-stage: ${results.summary.isMultiStage ? chalk.green('Yes') : chalk.red('No')}`);
  console.log(`  Issues: ${chalk.red.bold(results.summary.issues.high)} high, ` +
              `${chalk.yellow.bold(results.summary.issues.medium)} medium, ` +
              `${chalk.blue.bold(results.summary.issues.low)} low`);

  // Layer estimate
  if (results.layerEstimate) {
    console.log(chalk.bold(`\n📏 Estimated Size: ${results.layerEstimate.formattedTotal}`));
  }

  // Cache issues
  if (results.cacheIssues.length > 0) {
    console.log(chalk.bold(`\n⚠️  Issues Found (${results.cacheIssues.length}):`));

    for (const issue of results.cacheIssues) {
      const icon = issue.severity === 'high' ? '🔴' : issue.severity === 'medium' ? '🟡' : '🔵';
      console.log(`\n${icon} [${formatSeverity(issue.severity)}] ${issue.title}`);

      if (issue.description) {
        console.log(chalk.gray(`   ${issue.description}`));
      }

      if (issue.recommendation) {
        console.log(chalk.green(`   💡 ${issue.recommendation}`));
      }

      if (issue.issues && issue.issues.length > 0) {
        console.log(chalk.gray('   Lines affected:'));
        for (const i of issue.issues) {
          console.log(chalk.gray(`     - Line ${i.lineNum}: ${i.instruction.substring(0, 80)}...`));
        }
      }
    }
  } else {
    console.log(chalk.green.bold('\n✅ No issues found! Great Dockerfile practices.'));
  }

  console.log('');
}

/**
 * Print analysis results in JSON format
 */
function printJsonResults(results) {
  console.log(JSON.stringify(results, null, 2));
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let dockerfilePath = null;
  let format = 'text';
  let estimateSizes = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else if (arg === '--format' || arg === '-f') {
      format = args[++i];
    } else if (arg === '--estimate' || arg === '-e') {
      estimateSizes = true;
    } else if (!arg.startsWith('-')) {
      dockerfilePath = arg;
    }
  }

  // Validate arguments
  if (!dockerfilePath) {
    console.error(chalk.red('Error: Dockerfile path required'));
    printUsage();
    process.exit(1);
  }

  if (format !== 'json' && format !== 'text') {
    console.error(chalk.red('Error: Invalid format. Use "json" or "text"'));
    process.exit(1);
  }

  try {
    // Resolve path
    const resolvedPath = path.resolve(dockerfilePath);

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      console.error(chalk.red(`Error: File not found: ${resolvedPath}`));
      process.exit(1);
    }

    // Create analyzer and load Dockerfile
    const analyzer = new Analyzer(resolvedPath);
    await analyzer.load();

    // Run analysis
    const results = analyzer.analyze({ estimateSizes });

    // Output results
    if (format === 'json') {
      printJsonResults(results);
    } else {
      printTextResults(results, resolvedPath);
    }

    // Exit code based on high-severity issues
    if (results.summary.issues.high > 0) {
      process.exit(2);
    } else {
      process.exit(0);
    }
  } catch (error) {
    console.error(chalk.red(`Error: ${error.message}`));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('Fatal error:', error.message));
    process.exit(1);
  });
}

module.exports = { main };
