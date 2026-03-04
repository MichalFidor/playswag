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

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-03-04T10:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.2.0',
    totalTestCount: 10,
    tagCoverage: {
      users: {
        endpoints:      { total: 3, covered: 3, percentage: 100 },
        statusCodes:    { total: 6, covered: 5, percentage: 83.3 },
        parameters:     { total: 2, covered: 2, percentage: 100 },
        bodyProperties: { total: 1, covered: 1, percentage: 100 },
      },
    },
    summary: {
      endpoints:      { total: 4, covered: 3, percentage: 75 },
      statusCodes:    { total: 8, covered: 6, percentage: 75 },
      parameters:     { total: 4, covered: 2, percentage: 50 },
      bodyProperties: { total: 3, covered: 2, percentage: 66.7 },
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
          endpoints: { total: 2, covered: 1, percentage: 50 },
          statusCodes: { total: 4, covered: 2, percentage: 50 },
          parameters: { total: 0, covered: 0, percentage: 100 },
          bodyProperties: { total: 0, covered: 0, percentage: 100 },
        },
      },
    });
    await writeStepSummary(result, []);
    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Coverage by Tag');
  });
});
