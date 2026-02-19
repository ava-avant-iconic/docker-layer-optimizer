# Docker Layer Optimizer

A CLI tool that analyzes Dockerfiles to identify inefficiencies in layer structure, caching, and image size. Helps you build smaller, faster Docker images with better cache utilization.

## Features

- 🔍 **Dockerfile Parser** - Parses Dockerfiles with multi-stage build detection
- 📊 **Layer Size Analysis** - Analyzes layer sizes from `docker history` or estimates from Dockerfile
- ⚡ **Cache Optimization Rules** - Applies best practices to identify caching opportunities
- 🎯 **Smart Recommendations** - Actionable suggestions with severity levels
- 📝 **CLI with Diff Output** - Easy-to-use command-line interface
- 🧪 **Test Coverage** - Comprehensive test suite

## Installation

### Global Install

```bash
npm install -g docker-layer-optimizer
```

### Local Install

```bash
npm install docker-layer-optimizer
npx docker-layer-opt analyze Dockerfile
```

## Usage

### Basic Analysis

```bash
docker-layer-opt analyze Dockerfile
```

### With Size Estimation

```bash
docker-layer-opt analyze Dockerfile --estimate
```

### JSON Output

```bash
docker-layer-opt analyze Dockerfile --format json
```

### CI Integration

```bash
# Returns exit code 2 if high-severity issues are found
docker-layer-opt analyze Dockerfile
```

## Example Output

```
🐳 Docker Layer Optimization Report
File: /path/to/Dockerfile

📊 Summary:
  Instructions: 8
  Stages: 1
  Multi-stage: No
  Issues: 2 high, 1 medium, 1 low

⚠️  Issues Found (4):

🔴 [HIGH] Combine package installations
   Package installation commands should be combined into a single RUN layer
   💡 Combine all apt-get/yum/apk add commands into one RUN instruction
   Lines affected:
     - Line 3: RUN apt-get install -y curl
     - Line 4: RUN apt-get install -y git

🔴 [HIGH] Order COPY by change frequency
   Copy files that change less frequently before files that change often
   💡 Move package.json COPY before source file COPY to leverage layer caching
   Lines affected:
     - Line 5: COPY . .

🟡 [MEDIUM] Clean up package caches
   Package managers leave cache files that increase image size
   💡 Add cleanup commands after installations (e.g., apt-get clean)
   Lines affected:
     - Line 3: RUN apt-get install -y curl

🔵 [LOW] Prefer COPY over ADD
   ADD has automatic features that can be surprising
   💡 Use COPY for local files. Only use ADD for URL downloads
   Lines affected:
     - Line 6: ADD dist /app
```

## Optimization Rules

The tool analyzes your Dockerfile against these best practices:

### High Severity
- **Package Installation Combined** - Multiple package install commands should be combined
- **Copy Order** - Less frequently changed files (package.json) should be copied before source code

### Medium Severity
- **Cleanup Package Caches** - Remove package manager caches after installation
- **Multi-Stage Builds** - Use multi-stage builds to exclude build tools from final image
- **Layer Order** - Combine update and install commands to prevent stale caches
- **Update/Install Mismatch** - Keep package updates paired with installations

### Low Severity
- **COPY vs ADD** - Prefer explicit COPY over feature-heavy ADD
- **NPM Cache Mounts** - Consider BuildKit cache mounts for npm installs
- **Wildcard Copies** - Avoid wildcard patterns in COPY commands
- **Dockerignore** - Use .dockerignore to exclude unnecessary files

## Programmatic Usage

```javascript
const { Analyzer } = require('docker-layer-optimizer');

async function analyze() {
  const analyzer = new Analyzer('./Dockerfile');
  await analyzer.load();

  const results = analyzer.analyze({ estimateSizes: true });

  console.log(`Found ${results.cacheIssues.length} issues`);
  console.log(`Total layers: ${results.summary.totalInstructions}`);

  const suggestions = analyzer.generateSuggestions();
  for (const suggestion of suggestions) {
    console.log(`[${suggestion.severity}] ${suggestion.title}`);
  }
}

analyze();
```

## Exit Codes

- `0` - Success, no issues found
- `1` - Error occurred
- `2` - High-severity issues found (useful for CI)

## CI/CD Integration

### GitHub Actions

```yaml
name: Dockerfile Analysis

on: [push, pull_request]

jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npx docker-layer-opt analyze Dockerfile
```

### GitLab CI

```yaml
dockerfile-analysis:
  stage: test
  script:
    - npx docker-layer-opt analyze Dockerfile
  allow_failure: true
```

## Docker History Integration

For actual layer size analysis, you can combine with `docker history`:

```bash
# Build image first
docker build -t myapp:latest .

# Export history
docker history --no-trunc --format "{{.ID}}|{{.Size}}|{{.CreatedBy}}" myapp:latest > history.txt

# Analyze (programmatic)
const { Analyzer } = require('docker-layer-optimizer');
const analyzer = new Analyzer('./Dockerfile');
analyzer.load();

const layerAnalysis = analyzer.analyzeFromHistory(historyContent);
console.log(`Total size: ${layerAnalysis.formattedTotalSize}`);
```

## How It Works

1. **Parse** - Reads and parses your Dockerfile, detecting stages and instructions
2. **Analyze** - Applies optimization rules to identify issues
3. **Estimate** - Heuristically estimates layer sizes (optional)
4. **Report** - Provides actionable recommendations with severity levels

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with ❤️ to help the DevOps community build better Docker images.
