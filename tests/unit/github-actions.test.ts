import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isGitHubActions,
  emitAnnotations,
  writeStepSummary,
} from '../../src/output/github-actions.js';
import type { CoverageResult } from '../../src/types.js';
import type { ThresholdViolation } from '../../src/output/console.js';
import type { CoverageDelta } from '../../src/output/history.js';

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-03-04T10:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.2.0',
    totalTestCount: 10,
    tagCoverage: {
      users: {
        endpoints:          { total: 3, covered: 3, percentage: 100 },
        statusCodes:        { total: 6, covered: 5, percentage: 83.3 },
        parameters:         { total: 2, covered: 2, percentage: 100 },
        bodyProperties:     { total: 1, covered: 1, percentage: 100 },
        responseProperties: { total: 1, covered: 1, percentage: 100 },
      },
    },
    summary: {
      endpoints:          { total: 4, covered: 3, percentage: 75 },
      statusCodes:        { total: 8, covered: 6, percentage: 75 },
      parameters:         { total: 4, covered: 2, percentage: 50 },
      bodyProperties:     { total: 3, covered: 2, percentage: 66.7 },
      responseProperties: { total: 3, covered: 2, percentage: 66.7 },
    },
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  } as CoverageResult;
}

// ─── isGitHubActions ─────────────────────────────────────────────────────────

describe('isGitHubActions', () => {
  const ORIG = process.env['GITHUB_ACTIONS'];

  afterEach(() => {
    if (ORIG === undefined) {
      delete process.env['GITHUB_ACTIONS'];
    } else {
      process.env['GITHUB_ACTIONS'] = ORIG;
    }
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    expect(isGitHubActions()).toBe(true);
  });

  it('returns false when GITHUB_ACTIONS is unset', () => {
    delete process.env['GITHUB_ACTIONS'];
    expect(isGitHubActions()).toBe(false);
  });

  it('returns false when GITHUB_ACTIONS=false', () => {
    process.env['GITHUB_ACTIONS'] = 'false';
    expect(isGitHubActions()).toBe(false);
  });
});

// ─── emitAnnotations ─────────────────────────────────────────────────────────

describe('emitAnnotations', () => {
  let written = '';

  beforeEach(() => {
    written = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits ::error:: for fail violations', () => {
    const v: ThresholdViolation = { message: 'Endpoint coverage 70% below 80%', fail: true };
    emitAnnotations([v]);
    expect(written).toContain('::error::');
    expect(written).toContain('Endpoint coverage 70% below 80%');
  });

  it('emits ::warning:: for non-fail violations', () => {
    const v: ThresholdViolation = { message: 'Parameter coverage 40% below 50%', fail: false };
    emitAnnotations([v]);
    expect(written).toContain('::warning::');
  });

  it('emits nothing given an empty array', () => {
    emitAnnotations([]);
    expect(written).toBe('');
  });

  it('emits one line per violation', () => {
    const violations: ThresholdViolation[] = [
      { message: 'A', fail: true },
      { message: 'B', fail: false },
    ];
    emitAnnotations(violations);
    const lines = written.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });
});

// ─── writeStepSummary ────────────────────────────────────────────────────────

describe('writeStepSummary', () => {
  let tmpDir: string;
  const ORIG = process.env['GITHUB_STEP_SUMMARY'];

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-ga-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (ORIG === undefined) {
      delete process.env['GITHUB_STEP_SUMMARY'];
    } else {
      process.env['GITHUB_STEP_SUMMARY'] = ORIG;
    }
  });

  it('does nothing when GITHUB_STEP_SUMMARY is not set', async () => {
    delete process.env['GITHUB_STEP_SUMMARY'];
    // Should not throw
    await expect(writeStepSummary(makeResult(), [])).resolves.toBeUndefined();
  });

  it('writes a markdown table to the summary file', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('## playswag');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Status Codes');
    expect(content).toContain('Parameters');
    expect(content).toContain('Body Properties');
  });

  it('includes a tag coverage table when tags exist', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Coverage by Tag');
    expect(content).toContain('users');
  });

  it('includes violations section when violations are present', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const violations: ThresholdViolation[] = [
      { message: 'Endpoint coverage 70.0% is below threshold 80%', fail: true },
    ];
    await writeStepSummary(makeResult(), violations);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Threshold Violations');
    expect(content).toContain('Endpoint coverage');
    expect(content).toContain('❌');
  });

  it('does NOT include violations section when violations list is empty', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Threshold Violations');
  });

  it('uses warning emoji for non-fail violations', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const violations: ThresholdViolation[] = [
      { message: 'Parameter coverage warn', fail: false },
    ];
    await writeStepSummary(makeResult(), violations);
    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('⚠️');
  });

  it('skips tag table when tagCoverage only has (untagged)', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      tagCoverage: {
        '(untagged)': {
          endpoints:          { total: 2, covered: 1, percentage: 50 },
          statusCodes:        { total: 4, covered: 2, percentage: 50 },
          parameters:         { total: 0, covered: 0, percentage: 100 },
          bodyProperties:     { total: 0, covered: 0, percentage: 100 },
          responseProperties: { total: 0, covered: 0, percentage: 100 },
        },
      },
    });
    await writeStepSummary(result, []);
    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Coverage by Tag');
  });

  it('omits excluded dimensions from the summary table', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), [], {}, undefined, ['statusCodes', 'responseProperties']);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Parameters');
    expect(content).toContain('Body Properties');
    expect(content).not.toContain('Status Codes');
    expect(content).not.toContain('Response Properties');
  });

  it('shows delta indicators next to percentages when delta is provided', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const delta: CoverageDelta = {
      endpoints: 3.5,
      statusCodes: -2,
      parameters: 0,
      bodyProperties: 1,
      responseProperties: 0,
    };
    await writeStepSummary(makeResult(), [], {}, delta);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('↑3.5%');
    expect(content).toContain('↓2.0%');
    // zero delta suppressed
    expect(content).not.toContain('↑0');
    expect(content).not.toContain('↓0');
  });

  it('includes collapsible uncovered operations when showUncoveredOperations is true', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const result = makeResult({
      uncoveredOperations: [
        { path: '/api/widgets', method: 'get', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
        { path: '/api/widgets/{id}', method: 'delete', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
      ],
    });
    await writeStepSummary(result, [], { showUncoveredOperations: true });

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('<details>');
    expect(content).toContain('Uncovered operations (2)');
    expect(content).toContain('/api/widgets');
    expect(content).toContain('DELETE');
  });

  it('does not include uncovered operations section when showUncoveredOperations is false', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const result = makeResult({
      uncoveredOperations: [
        { path: '/api/widgets', method: 'get', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
      ],
    });
    await writeStepSummary(result, [], { showUncoveredOperations: false });

    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('<details>');
    expect(content).not.toContain('Uncovered operations');
  });

  it('omits excluded dimensions from the tag coverage table columns', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), [], {}, undefined, ['parameters', 'bodyProperties', 'responseProperties']);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Status Codes');
    // excluded dimensions must not appear in tag table header
    expect(content).not.toContain('Parameters');
    expect(content).not.toContain('Body Props');
    expect(content).not.toContain('Resp Props');
  });

  it('does NOT include unmatched hits when showUnmatchedHits is false (default)', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      unmatchedHits: [{ method: 'GET', url: 'http://api.example.com/unknown', statusCode: 404, testTitle: 't', testFile: 'f.spec.ts' }],
    });
    await writeStepSummary(result, [], {});
    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Unmatched API calls');
  });

  it('includes collapsible unmatched hits when showUnmatchedHits is true', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      unmatchedHits: [
        { method: 'GET', url: 'http://api.example.com/unknown', statusCode: 404, testTitle: 't', testFile: 'f.spec.ts' },
        { method: 'POST', url: 'http://api.example.com/other', statusCode: 500, testTitle: 't2', testFile: 'f.spec.ts' },
      ],
    });
    await writeStepSummary(result, [], { showUnmatchedHits: true });
    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Unmatched API calls (2)');
    expect(content).toContain('`GET`');
    expect(content).toContain('`http://api.example.com/unknown`');
    expect(content).toContain('404');
    expect(content).toContain('<details>');
  });
});
