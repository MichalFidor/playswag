import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHtmlReport, writeHtmlReport } from '../../src/output/html.js';
import type { CoverageResult, OperationCoverage } from '../../src/types.js';

function makeOperation(overrides: Partial<OperationCoverage> = {}): OperationCoverage {
  return {
    path: '/api/users',
    method: 'GET',
    covered: true,
    statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: false, testRefs: [] } },
    parameters: [
      { name: 'limit', in: 'query', required: false, covered: true },
    ],
    bodyProperties: [],
    responseProperties: [],
    testRefs: ['GET /api/users — returns list'],
    tags: ['users'],
    ...overrides,
  };
}

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-06-01T12:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.1.0',
    totalTestCount: 8,
    summary: {
      endpoints: { total: 4, covered: 3, percentage: 75 },
      statusCodes: { total: 8, covered: 6, percentage: 75 },
      parameters: { total: 4, covered: 2, percentage: 50 },
      bodyProperties: { total: 2, covered: 2, percentage: 100 },
      responseProperties: { total: 2, covered: 1, percentage: 50 },
    },
    operations: [makeOperation()],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  };
}

describe('generateHtmlReport', () => {
  it('returns a string starting with <!DOCTYPE html', () => {
    const html = generateHtmlReport(makeResult());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html/i);
  });

  it('includes a closing </html> tag', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('</html>');
  });

  it('includes the spec file name', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('openapi.yaml');
  });

  it('includes the operation path', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('/api/users');
  });

  it('includes the HTTP method', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('GET');
  });

  it('uses the default title when no config is provided', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('API Coverage Report');
  });

  it('uses a custom title from config', () => {
    const html = generateHtmlReport(makeResult(), { title: 'My Custom Report Title' });
    expect(html).toContain('My Custom Report Title');
  });

  it('includes summary card for Endpoints', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Endpoints');
  });

  it('includes summary card for Status Codes', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Status Codes');
  });

  it('includes summary card for Parameters', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Parameters');
  });

  it('includes summary card for Body Properties', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Body Properties');
  });

  it('includes the operations count in a visible element', () => {
    const html = generateHtmlReport(makeResult());
    // result has 1 operation
    expect(html).toContain('>1<');
  });

  it('shows green and red status code badges', () => {
    const op = makeOperation({
      statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: false, testRefs: [] } },
    });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('badge green');
    expect(html).toContain('badge red');
  });

  it('shows a covered tick for covered operations', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('tick green');
    expect(html).toContain('✓');
  });

  it('shows an uncovered cross for uncovered operations', () => {
    const op = makeOperation({ covered: false });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('tick red');
    expect(html).toContain('✗');
  });

  it('includes the test reference in the detail row', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('GET /api/users — returns list');
  });

  it('does not include the unmatched hits section when there are none', () => {
    const html = generateHtmlReport(makeResult({ unmatchedHits: [] }));
    expect(html).not.toContain('Unmatched Hits');
  });

  it('includes the unmatched hits section when hits exist', () => {
    const html = generateHtmlReport(
      makeResult({
        unmatchedHits: [
          {
            method: 'GET',
            url: 'http://localhost/api/unknown',
            statusCode: 404,
            testTitle: 'some test',
            testFile: 'test.spec.ts',
          },
        ],
      })
    );
    expect(html).toContain('Unmatched Hits');
    expect(html).toContain('/api/unknown');
  });

  it('includes the dark/light theme button', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('theme-btn');
  });

  it('includes filter buttons (All, Covered, Uncovered)', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('data-filter="all"');
    expect(html).toContain('data-filter="covered"');
    expect(html).toContain('data-filter="uncovered"');
  });

  it('includes a tag filter button for each unique tag', () => {
    const op1 = makeOperation({ tags: ['users'], path: '/api/users', method: 'GET' });
    const op2 = makeOperation({ tags: ['health'], path: '/api/health', method: 'GET' });
    const html = generateHtmlReport(makeResult({ operations: [op1, op2] }));
    expect(html).toContain('data-filter="tag:users"');
    expect(html).toContain('data-filter="tag:health"');
  });

  it('HTML-escapes the custom title to prevent XSS', () => {
    const html = generateHtmlReport(makeResult(), { title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the playswag version in the footer', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('1.1.0');
  });

  it('includes a <meta charset> UTF-8 declaration', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toMatch(/charset=.UTF-8/i);
  });
});

describe('writeHtmlReport', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-html-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the report to the default filename', async () => {
    await writeHtmlReport(makeResult(), tmpDir, {});
    const content = await readFile(join(tmpDir, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('returns the full path of the written file', async () => {
    const path = await writeHtmlReport(makeResult(), tmpDir, {});
    expect(path).toBe(join(tmpDir, 'playswag-coverage.html'));
  });

  it('respects a custom fileName', async () => {
    await writeHtmlReport(makeResult(), tmpDir, { fileName: 'report.html' });
    const content = await readFile(join(tmpDir, 'report.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('creates the output directory if it does not exist', async () => {
    const nested = join(tmpDir, 'coverage', 'output');
    await writeHtmlReport(makeResult(), nested, {});
    const content = await readFile(join(nested, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('uses the custom title from config in written file', async () => {
    await writeHtmlReport(makeResult(), tmpDir, { title: 'E2E Coverage' });
    const content = await readFile(join(tmpDir, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('E2E Coverage');
  });
});
