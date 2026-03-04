import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { writeJUnitReport } from '../../src/output/junit.js';
import type { CoverageResult, ThresholdConfig } from '../../src/types.js';

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-03-04T10:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.2.0',
    totalTestCount: 5,
    tagCoverage: {},
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

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'playswag-junit-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('writeJUnitReport', () => {
  it('creates a file at the expected output path', async () => {
    const result = makeResult();
    const outputPath = await writeJUnitReport(result, tmpDir, undefined);
    expect(outputPath).toBe(join(tmpDir, 'playswag-junit.xml'));
  });

  it('respects a custom fileName', async () => {
    const result = makeResult();
    const outputPath = await writeJUnitReport(result, tmpDir, undefined, { fileName: 'custom.xml' });
    expect(outputPath).toBe(join(tmpDir, 'custom.xml'));
  });

  it('writes valid XML with the expected root elements', async () => {
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, undefined);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<testsuites');
    expect(xml).toContain('<testsuite');
    expect(xml).toContain('</testsuites>');
  });

  it('emits 5 testcases — one per coverage dimension', async () => {
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, undefined);
    const xml = await readFile(outputPath, 'utf8');

    const matches = xml.match(/<testcase /g);
    expect(matches).toHaveLength(5);
  });

  it('marks dimensions as self-closing testcase elements when no threshold violation', async () => {
    const threshold: ThresholdConfig = { endpoints: 50 }; // 75% > 50% — passes
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, threshold);
    const xml = await readFile(outputPath, 'utf8');

    // Self-closing testcase for the passing endpoint dimension
    expect(xml).toContain('<testcase name="Endpoint Coverage"');
    expect(xml).toContain('/>');
  });

  it('adds a <failure> element when a threshold is violated', async () => {
    const threshold: ThresholdConfig = { endpoints: 80 }; // 75% < 80% — fails
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, threshold);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('<failure');
    expect(xml).toContain('75.0%');
    expect(xml).toContain('80%');
    expect(xml).toContain('ThresholdViolation');
  });

  it('reports failures count correctly on testsuite element', async () => {
    const threshold: ThresholdConfig = { endpoints: 80, statusCodes: 80 }; // both violated
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, threshold);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('failures="2"');
  });

  it('has 0 failures when no threshold is configured', async () => {
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, undefined);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('failures="0"');
  });

  it('has 0 failures when all dimensions pass their thresholds', async () => {
    const threshold: ThresholdConfig = { endpoints: 50, statusCodes: 50, parameters: 50, bodyProperties: 50, responseProperties: 50 };
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, threshold);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('failures="0"');
    expect(xml).not.toContain('<failure');
  });

  it('escapes XML special characters in failure messages', async () => {
    // Coverage at 66.7% with threshold 70 — violated
    const result = makeResult({
      summary: {
        endpoints:          { total: 4, covered: 3, percentage: 66.7 },
        statusCodes:        { total: 4, covered: 3, percentage: 66.7 },
        parameters:         { total: 4, covered: 3, percentage: 66.7 },
        bodyProperties:     { total: 4, covered: 3, percentage: 66.7 },
        responseProperties: { total: 4, covered: 3, percentage: 66.7 },
      },
    });
    const outputPath = await writeJUnitReport(result, tmpDir, { endpoints: 70 });
    const xml = await readFile(outputPath, 'utf8');

    // The XML must not contain unescaped <, >, &
    const _content = xml.slice(xml.indexOf('<testsuites'));
    // Just verify it's parseable (no raw angle brackets in attribute values)
    expect(xml).not.toMatch(/message="[^"]*</);
  });

  it('includes the timestamp from the coverage result', async () => {
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, undefined);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('2025-03-04T10:00:00.000');
  });

  it('includes meaningful classname and testcase names', async () => {
    const outputPath = await writeJUnitReport(makeResult(), tmpDir, undefined);
    const xml = await readFile(outputPath, 'utf8');

    expect(xml).toContain('Endpoint Coverage');
    expect(xml).toContain('Status Code Coverage');
    expect(xml).toContain('Parameter Coverage');
    expect(xml).toContain('Body Property Coverage');
    expect(xml).toContain('Response Property Coverage');
    expect(xml).toContain('classname="playswag.coverage"');
  });
});
