#!/usr/bin/env node

/**
 * Docker Layer Optimizer CLI
 */

import { Command } from 'commander';
import { readFileSync, existsSync } from 'fs';
import { DockerLayerOptimizer } from './index.js';
import chalk from 'chalk';
import { diffLines } from 'diff';

const program = new Command();

program
  .name('docker-layer-optimizer')
  .description('Analyze and optimize Dockerfiles for better caching and smaller images')
  .version('1.0.0')
  .argument('<dockerfile>', 'Path to Dockerfile')
  .option('-o, --output <format>', 'Output format: text, json', 'text')
  .option('-v, --verbose', 'Show verbose output', false)
  .option('--severity <level>', 'Minimum severity to show: high, medium, low', 'medium')
  .action(async (dockerfilePath, options) => {
    try {
      if (!existsSync(dockerfilePath)) {
        console.error(chalk.red(`Error: Dockerfile not found: ${dockerfilePath}`));
        process.exit(1);
      }

      const content = readFileSync(dockerfilePath, 'utf-8');
      const optimizer = new DockerLayerOptimizer();
      const result = optimizer.analyzeContent(content, dockerfilePath);

      if (options.output === 'json') {
        console.log(JSON.stringify(result, null, 2));
      } else {
        printTextOutput(result, options);
      }
    } catch (error) {
      console.error(chalk.red(`Error: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

function printTextOutput(result: any, options: any): void {
  const { parseResult, layerAnalysis, cacheOptimizations, sizeEstimate } = result;

  // Header
  console.log(chalk.bold.blue(`\n📦 Docker Layer Optimizer Analysis\n`));
  console.log(chalk.gray(`File: ${result.dockerfile}`));
  console.log(chalk.gray(`Total Layers: ${layerAnalysis.totalLayers}`));
  console.log(chalk.gray(`Multi-Stage: ${parseResult.hasMultiStage ? 'Yes' : 'No'}\n`));

  // Layer breakdown
  console.log(chalk.bold('📊 Layer Breakdown:'));
  Object.entries(layerAnalysis.layerTypes).forEach(([type, count]) => {
    console.log(`  ${type}: ${count}`);
  });
  console.log('');

  // Size estimate
  console.log(chalk.bold('📏 Estimated Size:'));
  console.log(`  ${chalk.cyan(sizeEstimate.estimatedSize)}`);
  sizeEstimate.breakdown.forEach((item: any) => {
    console.log(`    ${item.category}: ${item.estimatedSize} (${item.layers} layers)`);
  });
  console.log('');

  // Cache optimizations
  const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const minSeverity = severityOrder[options.severity] || 1;

  const filteredOptimizations = cacheOptimizations.filter(
    (opt: any) => severityOrder[opt.severity as string] <= minSeverity
  );

  if (filteredOptimizations.length > 0) {
    console.log(chalk.bold('💡 Cache Optimizations:'));
    filteredOptimizations.forEach((opt: any, index: number) => {
      const severityColor = (opt.severity === 'high' ? chalk.red :
                           opt.severity === 'medium' ? chalk.yellow : chalk.gray);

      console.log(`\n  ${index + 1}. ${severityColor(`[${opt.severity.toUpperCase()}]`)} ${opt.issue}`);
      console.log(chalk.gray(`     Line ${opt.lineNumber}`));
      console.log(`     ${chalk.green('→')} ${opt.suggestion}`);

      if (options.verbose && opt.before && opt.after) {
        console.log('');
        printDiff(opt.before, opt.after);
      }
    });
    console.log('');
  } else {
    console.log(chalk.green('✅ No cache optimizations needed!\n'));
  }

  // Size recommendations
  if (sizeEstimate.recommendations.length > 0) {
    console.log(chalk.bold('🎯 Size Recommendations:'));
    sizeEstimate.recommendations.forEach((rec: string) => {
      console.log(`  ${chalk.yellow('•')} ${rec}`);
    });
    console.log('');
  }

  // Layer analysis issues
  if (layerAnalysis.potentialIssues.length > 0) {
    console.log(chalk.bold('⚠️  Potential Issues:'));
    layerAnalysis.potentialIssues.forEach((issue: string) => {
      console.log(`  ${chalk.red('•')} ${issue}`);
    });
    console.log('');
  }

  // Summary
  console.log(chalk.bold('📋 Summary:'));
  console.log(`  Total Layers: ${chalk.cyan(layerAnalysis.totalLayers)}`);
  console.log(`  High Priority Issues: ${chalk.red(cacheOptimizations.filter((o: any) => o.severity === 'high').length)}`);
  console.log(`  Medium Priority Issues: ${chalk.yellow(cacheOptimizations.filter((o: any) => o.severity === 'medium').length)}`);
  console.log(`  Low Priority Issues: ${chalk.gray(cacheOptimizations.filter((o: any) => o.severity === 'low').length)}`);
  console.log('');
}

function printDiff(before: string, after: string): void {
  const diff = diffLines(before, after);

  diff.forEach((part: any) => {
    const color = part.added ? chalk.green : part.removed ? chalk.red : chalk.gray;
    const prefix = part.added ? '+ ' : part.removed ? '- ' : '  ';

    part.value.split('\n').forEach((line: string) => {
      if (line) {
        console.log(color(`     ${prefix}${line}`));
      }
    });
  });
}

program.parse();
