import { describe, it, expect } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { safeJsonStringify, parseJsonWithLimit, isCoverageResult, isEndpointHit, isEndpointHits, normalizeCoverageResult, readJsonFileWithLimit, readJsonFileWithLimitSync } from '../../src/utils/safe-json.js';
import type { CoverageResult } from '../../src/types.js';

function report(): CoverageResult {
  const dimension = { total: 0, covered: 0, percentage: 100 };
  return {
    specFiles: [], timestamp: '2026-09-30T12:00:00.000Z', playswagVersion: '1.11.0', playwrightVersion: '1.63.0', totalTestCount: 0,
    summary: { endpoints: dimension, statusCodes: dimension, parameters: dimension, bodyProperties: dimension, responseProperties: dimension },
    tagCoverage: {}, operations: [], uncoveredOperations: [], unmatchedHits: [], acknowledgedHits: [],
  };
}

describe('safeJsonStringify', () => {
  it('handles circular references', () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj['self'] = obj;
    const json = safeJsonStringify([obj]);
    expect(json).toContain('[Circular]');
  });

  it('stringifies without throwing', () => {
    expect(safeJsonStringify({ ok: true })).toBe('{"ok":true}');
  });

  it('does not invoke Buffer.toJSON, custom toJSON or getters', () => {
    const body = { binary: Buffer.from('binary-secret'), toJSON: () => 'serializer-secret', get secret() { throw new Error('getter ran'); } };
    const serialized = safeJsonStringify(body);
    expect(serialized).toContain('[Buffer 13 bytes]');
    expect(serialized).not.toContain('binary-secret');
    expect(serialized).not.toContain('serializer-secret');
    expect(serialized).toContain('[Accessor]');
  });

  it('bounds depth and sparse arrays and permits shared acyclic values', () => {
    const value = { ok: true };
    expect(JSON.parse(safeJsonStringify([value, value]))).toEqual([value, value]);
    let nested: unknown = value;
    for (let i = 0; i < 2000; i++) nested = { child: nested };
    expect(safeJsonStringify(nested)).toContain('[Truncated]');
    const sparse: unknown[] = [];
    sparse[1_000_000_000] = 'tail';
    expect(safeJsonStringify(sparse).length).toBeLessThan(1_500_000);
  });
});

describe('parseJsonWithLimit', () => {
  it('throws when payload exceeds limit', () => {
    const big = JSON.stringify({ x: 'a'.repeat(200) });
    expect(() => parseJsonWithLimit(big, 50)).toThrow(/exceeds/);
  });
});

describe('isCoverageResult', () => {
  it('accepts a complete valid report and rejects the former shallow shape', () => {
    expect(isCoverageResult(report())).toBe(true);
    expect(isCoverageResult({ operations: [], summary: { endpoints: {} } })).toBe(false);
  });

  it('rejects invalid shape', () => {
    expect(isCoverageResult({ foo: 1 })).toBe(false);
  });

  it.each([
    { total: 1, covered: 2, percentage: 100 },
    { total: 1, covered: 1, percentage: '<img src=x onerror=alert(1)>' },
    { total: 1, covered: 1, percentage: Infinity },
    { total: -1, covered: 0, percentage: 0 },
  ])('rejects malformed summary values', (dimension) => {
    const value = report();
    expect(isCoverageResult({ ...value, summary: { ...value.summary, endpoints: dimension } })).toBe(false);
  });

  it('validates nested operations and hits before the renderer or merger uses them', () => {
    expect(isCoverageResult({ ...report(), operations: [null] })).toBe(false);
    expect(isCoverageResult({ ...report(), unmatchedHits: [{ method: 'GET', url: 'http://example.com' }] })).toBe(false);
    expect(isCoverageResult({ ...report(), tagCoverage: { tag: { endpoints: {} } } })).toBe(false);
    expect(isCoverageResult({ ...report(), acknowledgedHits: [{ label: 'x', pattern: '**', count: '1' }] })).toBe(false);
  });

  it('fills only missing legacy fields without changing the supplied report', () => {
    const original = report();
    const { responseProperties: _responseProperties, ...summary } = original.summary;
    const { tagCoverage: _tagCoverage, acknowledgedHits: _acknowledgedHits, ...legacy } = original;
    const value = { ...legacy, summary };
    expect(isCoverageResult(normalizeCoverageResult(value))).toBe(true);
    expect(value.summary).not.toHaveProperty('responseProperties');
    expect(() => normalizeCoverageResult({ ...original, acknowledgedHits: null })).toThrow(/Invalid/);
  });
});

describe('hit validation and bounded file reads', () => {
  const hit = { method: 'GET', url: 'https://example.com', statusCode: 200, testFile: 'test.ts', testTitle: 'test' };
  it('rejects unsafe methods, invalid status values and non-string header values', () => {
    expect(isEndpointHit(hit)).toBe(true);
    expect(isEndpointHits([hit])).toBe(true);
    expect(isEndpointHits([hit, null])).toBe(false);
    expect(isEndpointHit({ ...hit, method: 'GET" onclick="bad' })).toBe(false);
    expect(isEndpointHit({ ...hit, statusCode: '200' })).toBe(false);
    expect(isEndpointHit({ ...hit, headers: { cookie: {} } })).toBe(false);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(isEndpointHit({ ...hit, requestBody: circular })).toBe(false);
  });

  it('enforces the byte limit while reading files in both reporter and CLI paths', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'playswag-json-limit-'));
    try {
      const file = join(directory, 'report.json');
      await writeFile(file, JSON.stringify({ value: 'ż'.repeat(100) }));
      await expect(readJsonFileWithLimit(file, 100)).rejects.toThrow(/exceeds/);
      expect(() => readJsonFileWithLimitSync(file, 100)).toThrow(/exceeds/);
      expect(await readJsonFileWithLimit(file, 1000)).toEqual({ value: 'ż'.repeat(100) });
      expect(readJsonFileWithLimitSync(file, 1000)).toEqual({ value: 'ż'.repeat(100) });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
