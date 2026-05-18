import { describe, it, expect } from 'vitest';
import { safeJsonStringify, parseJsonWithLimit, isCoverageResult } from '../../src/utils/safe-json.js';

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
});

describe('parseJsonWithLimit', () => {
  it('throws when payload exceeds limit', () => {
    const big = JSON.stringify({ x: 'a'.repeat(200) });
    expect(() => parseJsonWithLimit(big, 50)).toThrow(/exceeds/);
  });
});

describe('isCoverageResult', () => {
  it('accepts minimal valid shape', () => {
    expect(isCoverageResult({ operations: [], summary: { endpoints: {} } })).toBe(true);
  });

  it('rejects invalid shape', () => {
    expect(isCoverageResult({ foo: 1 })).toBe(false);
  });
});
