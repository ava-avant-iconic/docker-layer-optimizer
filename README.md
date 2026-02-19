# Docker Layer Optimizer

CLI tool that analyzes Dockerfiles to identify inefficiencies in layer structure, caching, and image size.

## Features

- 📦 **Dockerfile Parser** - Parse Dockerfiles with multi-stage build detection
- 📊 **Layer Size Analysis** - Analyze layer structure and identify inefficiencies
- 💡 **Cache Optimization** - Smart suggestions for better Docker layer caching
- 📏 **Size Estimation** - Estimate final image size with breakdown by category
- 🔍 **Best Practices** - Enforce Docker best practices automatically
- 📝 **Diff Output** - See before/after comparisons for suggested changes

## Installation

```bash
npm install -g docker-layer-optimizer
```

Or use directly with npx:

```bash
npx docker-layer-optimizer Dockerfile
```

## Usage

### Basic Usage

```bash
docker-layer-optimizer Dockerfile
```

### Output Formats

**Text output (default):**
```bash
docker-layer-optimizer Dockerfile
```

**JSON output:**
```bash
docker-layer-optimizer Dockerfile --output json
```

### Options

- `-o, --output <format>` - Output format: `text` or `json` (default: `text`)
- `-v, --verbose` - Show verbose output with diff examples
- `--severity <level>` - Minimum severity to show: `high`, `medium`, `low` (default: `medium`)

### Examples

Analyze a Dockerfile with high-severity issues only:
```bash
docker-layer-optimizer Dockerfile --severity high
```

Show verbose output with diff examples:
```bash
docker-layer-optimizer Dockerfile --verbose
```

## What It Checks

### Cache Optimizations

- **apt-get/update separation** - Combines `apt-get update` and `apt-get install` into a single layer
- **Package.json placement** - Suggests moving `package*.json` before source code copies
- **Cache mounts** - Recommends BuildKit cache mounts for package managers
- **Layer ordering** - Identifies cache-breaking layer order issues
- **Cleanup commands** - Ensures cleanup after package installations

### Size Optimizations

- **Base image selection** - Suggests alpine/slim variants where appropriate
- **Multi-stage builds** - Recommends multi-stage builds to exclude build tools
- **Unnecessary copies** - Detects copying of `node_modules` and other large directories
- **Dockerignore** - Reminds about `.dockerignore` for context reduction
- **Cleanup operations** - Ensures cleanup after package installations

### Layer Analysis

- Total layer count
- Layer type breakdown
- Potential issues (too many RUN instructions, missing cleanup, etc.)

## Example Output

```
📦 Docker Layer Optimizer Analysis

File: Dockerfile
Total Layers: 8
Multi-Stage: No

📊 Layer Breakdown:
  FROM: 1
  WORKDIR: 1
  COPY: 2
  RUN: 3
  CMD: 1

📏 Estimated Size:
  245 MB
    Base Image: 120 MB (1 layers)
    RUN Layers: 75.0 MB (3 layers)
    COPY Layers: 50.0 MB (2 layers)

💡 Cache Optimizations:

  1. [HIGH] apt-get update and install are in separate layers
     Line 4
     → Combine update and install into a single RUN to prevent cache invalidation issues

  2. [HIGH] All source files are copied before package.json
     Line 6
     → Copy package.json first, then install dependencies, then copy the rest. This maximizes layer caching.

🎯 Size Recommendations:
  • Consider using an alpine or slim variant of node to reduce base image size
  • Use .dockerignore to exclude unnecessary files (node_modules, .git, etc.) from COPY . .
  • Avoid copying node_modules - install them in the container to ensure platform compatibility

📋 Summary:
  Total Layers: 8
  High Priority Issues: 2
  Medium Priority Issues: 1
  Low Priority Issues: 0
```

## Use Cases

- **CI/CD Pipelines** - Analyze Dockerfiles before building
- **Code Reviews** - Automated Dockerfile optimization checks
- **Development** - Quick feedback while writing Dockerfiles
- **Migration** - Identify optimization opportunities in existing Dockerfiles

## Library Usage

You can also use this as a library in your Node.js projects:

```typescript
import { DockerLayerOptimizer } from 'docker-layer-optimizer';

const optimizer = new DockerLayerOptimizer();
const result = optimizer.analyze('path/to/Dockerfile');

console.log(result.cacheOptimizations);
console.log(result.sizeEstimate);
```

## Benefits

- ⚡ **Faster deploys** - Smaller images upload and download faster
- 🚀 **Faster rebuilds** - Better caching means fewer layers need rebuilding
- 💰 **Cost savings** - Smaller images use less storage and bandwidth
- ✅ **Best practices** - Automatically enforces Docker best practices
- 🎯 **Actionable** - Concrete suggestions with before/after examples

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Author

AVA <ava@avant-iconic.com>
