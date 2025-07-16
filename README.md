# PlaySwag

[![npm version](https://img.shields.io/npm/v/playswag.svg)](https://www.npmjs.com/package/playswag)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

PlaySwag is a comprehensive API test coverage tool for Playwright that integrates seamlessly with OpenAPI/Swagger specifications. It helps you track, analyze, and improve your API test coverage.

## Features

✅ Track and analyze API requests made with Playwright  
✅ Compare requests against OpenAPI/Swagger specifications  
✅ Generate detailed coverage reports  
✅ Identify untested API endpoints  
✅ Export results in various formats (JSON, CSV, JUnit XML)  
✅ **Global request tracking across multiple test instances** 🆕  
✅ **Comprehensive test suite coverage analysis** 🆕

## Installation

```bash
# npm
npm install playswag --save-dev

# yarn
yarn add playswag --dev

# pnpm
pnpm add playswag --save-dev
```

## Quick Start

```typescript
import { test, request } from '@playwright/test';
import { createPlaySwag } from 'playswag';

test('API coverage example', async () => {
  // Create Playwright API context
  const apiContext = await request.newContext({
    baseURL: 'https://api.example.com'
  });

  // Create PlaySwag instance with your API context
  const playswag = createPlaySwag(apiContext);

  // Load OpenAPI/Swagger specification
  await playswag.loadSpecFromUrl('https://api.example.com/swagger.json');
  // OR from file: playswag.loadSpecFromFile('./path/to/swagger.json');

  // Use the wrapped request object for automatic tracking
  await playswag.request.get('/users');
  await playswag.request.post('/users', {
    data: { name: 'John', email: 'john@example.com' }
  });

  // Generate and print coverage report
  playswag.printReport();

  // Clean up
  await apiContext.dispose();
});
```

## Usage Examples

### Basic API Coverage Analysis

```typescript
import { test, request } from '@playwright/test';
import { createPlaySwag } from 'playswag';

test('should analyze API coverage', async ({ request }) => {
  // Create PlaySwag instance
  const playswag = createPlaySwag(request);
  
  // Load OpenAPI spec
  await playswag.loadSpecFromUrl('https://petstore.swagger.io/v2/swagger.json');
  
  // Make API calls using the wrapped request object
  await playswag.request.get('/pet/1');
  await playswag.request.get('/store/inventory');
  
  // Get detailed coverage report
  const report = playswag.generateReport();
  
  // Output coverage statistics
  console.log(`API Coverage: ${report.coveragePercentage.toFixed(2)}%`);
  console.log(`Covered endpoints: ${report.coveredEndpoints}/${report.totalEndpoints}`);
  
  // Analyze uncovered endpoints
  if (report.uncoveredEndpoints.length > 0) {
    console.log('Uncovered endpoints that need tests:');
    report.uncoveredEndpoints.forEach(endpoint => {
      console.log(`- ${endpoint.method} ${endpoint.path}`);
    });
  }
});
```

### Global Request Tracking 🆕

PlaySwag now supports global request tracking across multiple test instances, allowing you to analyze API coverage for your entire test suite:

```typescript
// Test 1
test('test users API', async () => {
  const playswag = createPlaySwag(await request.newContext());
  await playswag.request.get('/users'); // Tracked globally
});

// Test 2
test('test posts API', async () => {
  const playswag = createPlaySwag(await request.newContext()); // Different instance
  await playswag.request.get('/posts'); // Also tracked globally
});

// Test 3: Generate comprehensive coverage
test('coverage analysis', async () => {
  const playswag = createPlaySwag(await request.newContext());
  playswag.loadSpecFromFile('api-spec.json');
  
  // Generate report using data from ALL test instances
  const globalReport = playswag.generateReport(true); // true = use global data
  console.log(`Overall test suite coverage: ${globalReport.coveragePercentage}%`);
  
  // Compare with local coverage (this test only)
  const localReport = playswag.generateReport(false);
  console.log(`This test coverage: ${localReport.coveragePercentage}%`);
});
```

**Important**: For global tracking to work across tests, run with a single worker:
```bash
npx playwright test --workers=1
```

See [GLOBAL_TRACKING.md](./GLOBAL_TRACKING.md) for complete documentation.

### Exporting Test Results

```typescript
import { test } from '@playwright/test';
import { createPlaySwag } from 'playswag';

test('should export API test results', async ({ request }) => {
  const playswag = createPlaySwag(request);
  
  // Make some API requests
  await playswag.request.get('/api/users');
  await playswag.request.get('/api/products');
  
  // Export results in different formats
  playswag.request.exportResults({
    format: 'json',
    filePath: './test-results/api-requests.json'
  });
  
  playswag.request.exportResults({
    format: 'junit',
    filePath: './test-results/api-tests.xml',
    testSuiteName: 'API Tests'
  });
  
  playswag.request.exportResults({
    format: 'csv',
    filePath: './test-results/api-requests.csv',
    includeHeaders: true
  });
});
```

## API Reference

### PlaySwag

| Method | Description |
|--------|-------------|
| `createPlaySwag(context)` | Creates a new PlaySwag instance |
| `loadSpecFromUrl(url)` | Loads OpenAPI spec from URL |
| `loadSpecFromFile(filePath)` | Loads OpenAPI spec from file |
| `generateReport()` | Generates coverage report |
| `printReport()` | Prints coverage report to console |
| `getRequests()` | Gets all tracked requests |
| `clearRequests()` | Clears tracked requests |

### RequestTracker

All standard Playwright request methods are supported:
- `get(url, options?)`
- `post(url, options?)`
- `put(url, options?)`
- `patch(url, options?)`
- `delete(url, options?)`
- `head(url, options?)`
- `fetch(urlOrRequest, options?)`

Additional methods:
- `getRequests()`
- `clearRequests()`
- `exportResults(options)`

### CoverageReport

| Property | Type | Description |
|----------|------|-------------|
| `totalEndpoints` | `number` | Total endpoints in spec |
| `coveredEndpoints` | `number` | Number of covered endpoints |
| `coveragePercentage` | `number` | Coverage percentage (0-100) |
| `uncoveredEndpoints` | `OpenAPIEndpoint[]` | Array of uncovered endpoints |
| `extraEndpoints` | `string[]` | Endpoints called but not in spec |
| `requestSummary` | `object` | Summary of request data |

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

[MIT](LICENSE)
