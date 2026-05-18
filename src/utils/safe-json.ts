/** Default max bytes for Playwright hit attachments and CLI JSON inputs. */
export const DEFAULT_MAX_JSON_BYTES = 10 * 1024 * 1024;

export function safeJsonStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, val) => {
    if (val === undefined) return undefined;
    if (typeof val === 'bigint') return val.toString();
    if (typeof val === 'function') return '[Function]';
    if (val instanceof Error) return val.message;
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(val)) {
      return `[Buffer ${val.length} bytes]`;
    }
    if (val && typeof val === 'object') {
      const tag = Object.prototype.toString.call(val);
      if (tag === '[object FormData]' || tag === '[object URLSearchParams]') {
        return `[${tag.slice(8, -1)}]`;
      }
      if (seen.has(val as object)) return '[Circular]';
      seen.add(val as object);
    }
    return val;
  });
}

export function parseJsonWithLimit<T>(raw: string, maxBytes = DEFAULT_MAX_JSON_BYTES): T {
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new Error(`JSON payload exceeds ${maxBytes} byte limit`);
  }
  return JSON.parse(raw) as T;
}

import type { CoverageResult } from '../types.js';

export function isCoverageResult(value: unknown): value is CoverageResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v['operations']) &&
    v['summary'] != null &&
    typeof v['summary'] === 'object'
  );
}
