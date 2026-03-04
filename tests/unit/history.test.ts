import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  compareCoverage,
  appendToHistory,
  loadLastEntry,
  loadAllEntries,
} from '../../src/output/history.js';
import type { CoverageSummary, CoverageResult } from '../../src/types.js';

function makeSummary(pct: number): CoverageSummary {
  return {
    endpoints:      { total: 100, covered: pct, percentage: pct },
    statusCodes:    { total: 100, covered: pct, percentage: pct },
    parameters:     { total: 100, covered: pct, percentage: pct },
    bodyProperties: { total: 100, covered: pct, percentage: pct },
  };
}

function makeResult(pct = 80, ts = '2025-01-01T00:00:00.000Z') {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: ts,
    playwrightVersion: '1.40.0',
    playswagVersion: '1.1.0',
    totalTestCount: 5,
    tagCoverage: {},
    summary: makeSummary(pct),
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
  } as CoverageResult;
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'playswag-history-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ─── compareCoverage ────────────────────────────────────────────────────────

describe('compareCoverage', () => {
  it('returns zero deltas when both summaries are identical', () => {
    const s = makeSummary(80);
    const delta = compareCoverage(s, s);
    expect(delta).toEqual({ endpoints: 0, statusCodes: 0, parameters: 0, bodyProperties: 0 });
  });

  it('returns positive deltas when current is higher', () => {
    const current = makeSummary(85);
    const previous = makeSummary(80);
    const delta = compareCoverage(current, previous);
    expect(delta.endpoints).toBe(5);
    expect(delta.statusCodes).toBe(5);
    expect(delta.parameters).toBe(5);
    expect(delta.bodyProperties).toBe(5);
  });

  it('returns negative deltas when current is lower (regression)', () => {
    const current = makeSummary(70);
    const previous = makeSummary(80);
    const delta = compareCoverage(current, previous);
    expect(delta.endpoints).toBe(-10);
  });

  it('rounds to one decimal place', () => {
    const current: CoverageSummary = {
      endpoints:      { total: 3, covered: 2, percentage: 66.7 },
      statusCodes:    { total: 3, covered: 2, percentage: 66.7 },
      parameters:     { total: 3, covered: 2, percentage: 66.7 },
      bodyProperties: { total: 3, covered: 2, percentage: 66.7 },
    };
    const previous: CoverageSummary = {
      endpoints:      { total: 3, covered: 1, percentage: 33.3 },
      statusCodes:    { total: 3, covered: 1, percentage: 33.3 },
      parameters:     { total: 3, covered: 1, percentage: 33.3 },
      bodyProperties: { total: 3, covered: 1, percentage: 33.3 },
    };
    const delta = compareCoverage(current, previous);
    expect(delta.endpoints).toBe(33.4);
  });

  it('each dimension is computed independently', () => {
    const current: CoverageSummary = {
      endpoints:      { total: 10, covered: 9, percentage: 90 },
      statusCodes:    { total: 10, covered: 5, percentage: 50 },
      parameters:     { total: 10, covered: 6, percentage: 60 },
      bodyProperties: { total: 10, covered: 7, percentage: 70 },
    };
    const previous: CoverageSummary = {
      endpoints:      { total: 10, covered: 8, percentage: 80 },
      statusCodes:    { total: 10, covered: 8, percentage: 80 },
      parameters:     { total: 10, covered: 5, percentage: 50 },
      bodyProperties: { total: 10, covered: 7, percentage: 70 },
    };
    const delta = compareCoverage(current, previous);
    expect(delta.endpoints).toBe(10);
    expect(delta.statusCodes).toBe(-30);
    expect(delta.parameters).toBe(10);
    expect(delta.bodyProperties).toBe(0);
  });
});

// ─── appendToHistory / loadLastEntry / loadAllEntries ───────────────────────

describe('appendToHistory and loadLastEntry', () => {
  it('returns null when no history file exists', async () => {
    const entry = await loadLastEntry(tmpDir);
    expect(entry).toBeNull();
  });

  it('returns empty array when no history file exists', async () => {
    const entries = await loadAllEntries(tmpDir);
    expect(entries).toEqual([]);
  });

  it('creates history file and returns the appended entry', async () => {
    const result = makeResult(80);
    await appendToHistory(result, tmpDir);
    const entry = await loadLastEntry(tmpDir);
    expect(entry).not.toBeNull();
    expect(entry!.timestamp).toBe(result.timestamp);
    expect(entry!.summary.endpoints.percentage).toBe(80);
  });

  it('appends multiple runs and loadLastEntry returns the most recent', async () => {
    await appendToHistory(makeResult(60, '2025-01-01T00:00:00.000Z'), tmpDir);
    await appendToHistory(makeResult(75, '2025-02-01T00:00:00.000Z'), tmpDir);
    await appendToHistory(makeResult(90, '2025-03-01T00:00:00.000Z'), tmpDir);

    const last = await loadLastEntry(tmpDir);
    expect(last!.summary.endpoints.percentage).toBe(90);
    expect(last!.timestamp).toBe('2025-03-01T00:00:00.000Z');
  });

  it('loadAllEntries returns all appended entries in order', async () => {
    await appendToHistory(makeResult(60, '2025-01-01T00:00:00.000Z'), tmpDir);
    await appendToHistory(makeResult(75, '2025-02-01T00:00:00.000Z'), tmpDir);

    const all = await loadAllEntries(tmpDir);
    expect(all).toHaveLength(2);
    expect(all[0]!.summary.endpoints.percentage).toBe(60);
    expect(all[1]!.summary.endpoints.percentage).toBe(75);
  });

  it('trims to maxEntries keeping the most recent', async () => {
    for (let i = 0; i < 5; i++) {
      await appendToHistory(makeResult(i * 10, `2025-0${i + 1}-01T00:00:00.000Z`), tmpDir, { maxEntries: 3 });
    }
    const all = await loadAllEntries(tmpDir, { maxEntries: 3 });
    expect(all).toHaveLength(3);
    // Most recent 3 runs (20, 30, 40 → percentages 20, 30, 40)
    expect(all[0]!.summary.endpoints.percentage).toBe(20);
    expect(all[2]!.summary.endpoints.percentage).toBe(40);
  });

  it('uses a custom file name when configured', async () => {
    await appendToHistory(makeResult(70), tmpDir, { fileName: 'my-history.json' });
    const entry = await loadLastEntry(tmpDir, { fileName: 'my-history.json' });
    expect(entry).not.toBeNull();
    // Default file should return null
    const def = await loadLastEntry(tmpDir);
    expect(def).toBeNull();
  });

  it('stores specFiles on each entry', async () => {
    const result = makeResult(80);
    result.specFiles = ['./api/v1.yaml', './api/v2.yaml'];
    await appendToHistory(result, tmpDir);
    const entry = await loadLastEntry(tmpDir);
    expect(entry!.specFiles).toEqual(['./api/v1.yaml', './api/v2.yaml']);
  });
});
