import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateMarkdownReport, writeMarkdownReport } from '../../src/output/markdown.js';
import type { CoverageResult, OperationCoverage } from '../../src/types.js';

function makeOperation(overrides: Partial<OperationCoverage> = {}): OperationCoverage {
  return {
    path: '/api/users',
    method: 'GET',
    covered: true,
    statusCodes: { '200': { covered: true, testRefs: [] } },
    parameters: [],
    bodyProperties: [],
    responseProperties: [],
    testRefs: [],
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
    totalTestCount: 5,
    summary: {
      endpoints:          { total: 4, covered: 3, percentage: 75 },
      statusCodes:        { total: 8, covered: 6, percentage: 75 },
      parameters:         { total: 4, covered: 2, percentage: 50 },
      bodyProperties:     { total: 2, covered: 2, percentage: 100 },
      responseProperties: { total: 2, covered: 1, percentage: 50 },
    },
    operations: [makeOperation()],
    uncoveredOperations: [],
    unmatchedHits: [],
    tagCoverage: {},
    ...overrides,
  };
}

// ─── generateMarkdownReport ──────────────────────────────────────────────────

describe('generateMarkdownReport', () => {
  it('starts with an H1 heading', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md.trimStart()).toMatch(/^# /);
  });

  it('uses the default title when no config is supplied', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md).toContain('# API Coverage Report');
  });

  it('uses a custom title from config', () => {
    const md = generateMarkdownReport(makeResult(), { title: 'My Service Coverage' });
    expect(md).toContain('# My Service Coverage');
  });

  it('contains a summary table with all five dimension rows', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md).toContain('Endpoints');
    expect(md).toContain('Status Codes');
    expect(md).toContain('Parameters');
    expect(md).toContain('Body Properties');
    expect(md).toContain('Response Properties');
  });

  it('renders covered and total counts in the summary table', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md).toContain('| 3 | 4');
  });

  it('uses the 🟢 badge for ≥80% coverage', () => {
    const md = generateMarkdownReport(makeResult({
      summary: {
        endpoints:          { total: 10, covered: 9, percentage: 90 },
        statusCodes:        { total: 10, covered: 9, percentage: 90 },
        parameters:         { total: 10, covered: 9, percentage: 90 },
        bodyProperties:     { total: 10, covered: 9, percentage: 90 },
        responseProperties: { total: 10, covered: 9, percentage: 90 },
      },
    }));
    expect(md).toContain('🟢');
  });

  it('uses the 🟡 badge for 50–79% coverage', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md).toContain('🟡');
  });

  it('uses the 🔴 badge for <50% coverage', () => {
    const md = generateMarkdownReport(makeResult({
      summary: {
        endpoints:          { total: 10, covered: 2, percentage: 20 },
        statusCodes:        { total: 10, covered: 2, percentage: 20 },
        parameters:         { total: 10, covered: 2, percentage: 20 },
        bodyProperties:     { total: 10, covered: 2, percentage: 20 },
        responseProperties: { total: 10, covered: 2, percentage: 20 },
      },
    }));
    expect(md).toContain('🔴');
  });

  it('does not include the Coverage by Tag section when tagCoverage is empty', () => {
    const md = generateMarkdownReport(makeResult({ tagCoverage: {} }));
    expect(md).not.toContain('## Coverage by Tag');
  });

  it('renders the per-tag table when tagCoverage is populated', () => {
    const tagSummary = {
      endpoints:          { total: 2, covered: 1, percentage: 50 },
      statusCodes:        { total: 2, covered: 1, percentage: 50 },
      parameters:         { total: 0, covered: 0, percentage: 100 },
      bodyProperties:     { total: 0, covered: 0, percentage: 100 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    };
    const md = generateMarkdownReport(makeResult({ tagCoverage: { users: tagSummary } }));
    expect(md).toContain('## Coverage by Tag');
    expect(md).toContain('`users`');
  });

  it('skips the (untagged) row in the tag table', () => {
    const tagSummary = {
      endpoints:          { total: 1, covered: 1, percentage: 100 },
      statusCodes:        { total: 1, covered: 1, percentage: 100 },
      parameters:         { total: 0, covered: 0, percentage: 100 },
      bodyProperties:     { total: 0, covered: 0, percentage: 100 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    };
    const md = generateMarkdownReport(makeResult({ tagCoverage: { '(untagged)': tagSummary } }));
    expect(md).not.toContain('## Coverage by Tag');
    expect(md).not.toContain('(untagged)');
  });

  it('renders the uncovered operations table when ops are uncovered', () => {
    const uncoveredOp = makeOperation({ path: '/api/orders', method: 'POST', covered: false });
    const md = generateMarkdownReport(makeResult({ operations: [uncoveredOp] }));
    expect(md).toContain('## Uncovered Operations');
    expect(md).toContain('`POST`');
    expect(md).toContain('`/api/orders`');
  });

  it('does not render the uncovered operations section when all ops are covered', () => {
    const md = generateMarkdownReport(makeResult());
    expect(md).not.toContain('## Uncovered Operations');
  });

  it('omits the uncovered operations section when showUncoveredOperations is false', () => {
    const uncoveredOp = makeOperation({ covered: false });
    const md = generateMarkdownReport(
      makeResult({ operations: [uncoveredOp] }),
      { showUncoveredOperations: false }
    );
    expect(md).not.toContain('## Uncovered Operations');
  });
});

// ─── writeMarkdownReport ─────────────────────────────────────────────────────

describe('writeMarkdownReport', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-md-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the report to the default filename', async () => {
    await writeMarkdownReport(makeResult(), tmpDir);
    const content = await readFile(join(tmpDir, 'playswag-coverage.md'), 'utf8');
    expect(content).toContain('# API Coverage Report');
  });

  it('returns the full path of the written file', async () => {
    const path = await writeMarkdownReport(makeResult(), tmpDir);
    expect(path).toBe(join(tmpDir, 'playswag-coverage.md'));
  });

  it('respects a custom fileName', async () => {
    await writeMarkdownReport(makeResult(), tmpDir, { fileName: 'coverage-summary.md' });
    const content = await readFile(join(tmpDir, 'coverage-summary.md'), 'utf8');
    expect(content).toBeTruthy();
  });

  it('creates the output directory if it does not exist', async () => {
    const nestedDir = join(tmpDir, 'nested', 'output');
    const path = await writeMarkdownReport(makeResult(), nestedDir);
    const content = await readFile(path, 'utf8');
    expect(content).toContain('# API Coverage Report');
  });
});
