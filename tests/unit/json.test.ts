import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJsonReport } from '../../src/output/json.js';
import type { CoverageResult } from '../../src/types.js';

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-01-01T00:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.0.0',
    totalTestCount: 5,
    summary: {
      endpoints: { total: 4, covered: 3, percentage: 75 },
      statusCodes: { total: 8, covered: 6, percentage: 75 },
      parameters: { total: 4, covered: 2, percentage: 50 },
      bodyProperties: { total: 3, covered: 3, percentage: 100 },
      responseProperties: { total: 3, covered: 3, percentage: 100 },
    },
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  };
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'playswag-json-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('writeJsonReport', () => {
  it('creates the output file at the expected path', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir);
    expect(outputPath).toBe(join(tmpDir, 'playswag-coverage.json'));

    const raw = await readFile(outputPath, 'utf8');
    expect(raw).toBeTruthy();
  });

  it('writes valid JSON that round-trips back to the original result', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir);
    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as CoverageResult;

    expect(parsed.totalTestCount).toBe(result.totalTestCount);
    expect(parsed.summary.endpoints.percentage).toBe(75);
    expect(parsed.specFiles).toEqual(result.specFiles);
  });

  it('pretty-prints by default (contains newlines)', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir);
    const raw = await readFile(outputPath, 'utf8');
    expect(raw).toMatch(/\n/);
  });

  it('produces compact JSON when pretty=false', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir, { pretty: false });
    const raw = await readFile(outputPath, 'utf8');
    expect(raw).not.toMatch(/\n/);
  });

  it('respects a custom fileName', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir, {
      fileName: 'custom-report.json',
    });
    expect(outputPath).toBe(join(tmpDir, 'custom-report.json'));
    const raw = await readFile(outputPath, 'utf8');
    expect(raw).toBeTruthy();
  });

  it('creates nested output directory when it does not exist', async () => {
    const result = makeResult();
    const nestedDir = join(tmpDir, 'deep', 'nested', 'dir');
    const outputPath = await writeJsonReport(result, nestedDir);
    const raw = await readFile(outputPath, 'utf8');
    expect(raw).toBeTruthy();
  });

  it('includes top-level metadata fields in the output', async () => {
    const result = makeResult();
    const outputPath = await writeJsonReport(result, tmpDir);
    const parsed = JSON.parse(await readFile(outputPath, 'utf8')) as Record<string, unknown>;

    expect(parsed).toHaveProperty('playwrightVersion');
    expect(parsed).toHaveProperty('playswagVersion');
    expect(parsed).toHaveProperty('totalTestCount');
    expect(parsed).toHaveProperty('timestamp');
  });
});
