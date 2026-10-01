import { createReadStream, openSync, readSync, closeSync } from 'node:fs';
import type { CoverageResult, CoverageSummary, EndpointHit } from '../types.js';

/** Default max bytes for Playwright hit attachments and CLI JSON inputs. */
export const DEFAULT_MAX_JSON_BYTES = 10 * 1024 * 1024;
const MAX_ITEMS = 100_000;
const MAX_DEPTH = 64;

export function safeJsonStringify(value: unknown): string {
  const ancestors = new WeakSet<object>();
  let remaining = MAX_ITEMS;
  let remainingBytes = DEFAULT_MAX_JSON_BYTES;
  function visit(input: unknown, depth: number): unknown {
    if (--remaining < 0 || depth > MAX_DEPTH) return '[Truncated]';
    if (typeof input === 'bigint') return input.toString();
    if (typeof input === 'function') return '[Function]';
    if (typeof input === 'string') {
      remainingBytes -= Buffer.byteLength(input);
      if (remainingBytes < 0) return '[Truncated]';
    }
    if (!input || typeof input !== 'object') return input;
    if (Buffer.isBuffer(input)) return `[Buffer ${input.length} bytes]`;
    if (ArrayBuffer.isView(input)) return `[Binary ${input.byteLength} bytes]`;
    if (input instanceof Error) return input.message;
    if (input instanceof Date) return Number.isFinite(input.getTime()) ? input.toISOString() : null;
    if (input instanceof URLSearchParams) return '[URLSearchParams]';
    if (typeof FormData !== 'undefined' && input instanceof FormData) return '[FormData]';
    if (ancestors.has(input)) return '[Circular]';
    ancestors.add(input);
    const result: unknown[] | Record<string, unknown> = Array.isArray(input) ? [] : Object.create(null);
    const keys = Array.isArray(input)
      ? Array.from({ length: Math.min(input.length, remaining) }, (_, index) => String(index))
      : Object.keys(input);
    for (const key of keys) {
      if (remaining <= 0) break;
      remainingBytes -= Buffer.byteLength(key);
      if (remainingBytes < 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      Object.defineProperty(result, key, {
        value: descriptor && 'value' in descriptor ? visit(descriptor.value, depth + 1) : '[Accessor]',
        enumerable: true, configurable: true, writable: true,
      });
    }
    ancestors.delete(input);
    return result;
  }
  return JSON.stringify(visit(value, 0)) ?? 'null';
}

function assertLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('JSON byte limit must be a positive safe integer');
}

export function parseJsonWithLimit<T>(raw: string, maxBytes = DEFAULT_MAX_JSON_BYTES): T {
  assertLimit(maxBytes);
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) throw new Error(`JSON payload exceeds ${maxBytes} byte limit`);
  return JSON.parse(raw) as T;
}

/** Stop reading as soon as the byte limit is exceeded, including files that grow. */
export async function readJsonFileWithLimit<T>(path: string, maxBytes = DEFAULT_MAX_JSON_BYTES): Promise<T> {
  assertLimit(maxBytes);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of createReadStream(path, { highWaterMark: 64 * 1024 })) {
    const buffer = chunk as Buffer;
    size += buffer.length;
    if (size > maxBytes) throw new Error(`JSON payload exceeds ${maxBytes} byte limit`);
    chunks.push(buffer);
  }
  return parseJsonWithLimit<T>(Buffer.concat(chunks, size).toString('utf8'), maxBytes);
}

export function readJsonFileWithLimitSync<T>(path: string, maxBytes = DEFAULT_MAX_JSON_BYTES): T {
  assertLimit(maxBytes);
  const fd = openSync(path, 'r');
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    while (true) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, maxBytes - size + 1));
      const count = readSync(fd, buffer, 0, buffer.length, null);
      if (count === 0) break;
      size += count;
      if (size > maxBytes) throw new Error(`JSON payload exceeds ${maxBytes} byte limit`);
      chunks.push(buffer.subarray(0, count));
    }
  } finally {
    closeSync(fd);
  }
  return parseJsonWithLimit<T>(Buffer.concat(chunks, size).toString('utf8'), maxBytes);
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function string(value: unknown): value is string {
  return typeof value === 'string' && value.length <= DEFAULT_MAX_JSON_BYTES;
}
function list(value: unknown, check: (item: unknown) => boolean): boolean {
  return Array.isArray(value) && value.length <= MAX_ITEMS && value.every(check);
}
function strings(value: unknown): value is string[] { return list(value, string); }
function optional(value: unknown, check: (item: unknown) => boolean): boolean { return value === undefined || check(value); }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0; }
function dictionary(value: unknown, check: (item: unknown) => boolean): boolean {
  return record(value) && Object.keys(value).length <= MAX_ITEMS && Object.values(value).every(check);
}
function method(value: unknown): boolean {
  return string(value) && /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,64}$/.test(value);
}
function jsonValue(value: unknown): boolean {
  const ancestors = new WeakSet<object>();
  let remaining = MAX_ITEMS;
  function visit(item: unknown, depth: number): boolean {
    if (--remaining < 0 || depth > MAX_DEPTH) return false;
    if (item === null || typeof item === 'boolean' || string(item)) return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (!record(item) && !Array.isArray(item)) return false;
    if (ancestors.has(item)) return false;
    ancestors.add(item);
    const valid = Object.values(item).every((child) => visit(child, depth + 1));
    ancestors.delete(item);
    return valid;
  }
  return visit(value, 0);
}

export function isEndpointHit(value: unknown): value is EndpointHit {
  if (!record(value)) return false;
  return method(value.method) && string(value.url)
    && Number.isInteger(value.statusCode) && (value.statusCode as number) >= 100 && (value.statusCode as number) <= 599
    && string(value.testFile) && string(value.testTitle)
    && optional(value.pathTemplate, string) && optional(value.projectName, string)
    && optional(value.queryParams, (v) => dictionary(v, string))
    && optional(value.pathParams, (v) => dictionary(v, string))
    && optional(value.headers, (v) => dictionary(v, string))
    && optional(value.requestBody, jsonValue) && optional(value.responseBody, jsonValue);
}

export function isEndpointHits(value: unknown): value is EndpointHit[] { return list(value, isEndpointHit); }

function summaryItem(value: unknown): boolean {
  return record(value) && count(value.total) && count(value.covered) && value.covered <= value.total
    && typeof value.percentage === 'number' && Number.isFinite(value.percentage)
    && value.percentage >= 0 && value.percentage <= 100;
}
export function isCoverageSummary(value: unknown): value is CoverageSummary {
  return record(value) && ['endpoints', 'statusCodes', 'parameters', 'bodyProperties', 'responseProperties'].every((key) => summaryItem(value[key]));
}
function bodyProperty(value: unknown): boolean {
  return record(value) && string(value.name) && typeof value.required === 'boolean' && typeof value.covered === 'boolean';
}
function statusCode(value: unknown): boolean {
  return string(value) && /^(?:[1-5](?:\d{2}|xx)|default)$/i.test(value);
}
function operation(value: unknown): boolean {
  return record(value) && string(value.path) && method(value.method) && typeof value.covered === 'boolean'
    && optional(value.operationId, string) && optional(value.tags, strings) && optional(value.deprecated, (v) => typeof v === 'boolean')
    && dictionary(value.statusCodes, (v) => record(v) && typeof v.covered === 'boolean' && strings(v.testRefs))
    && Object.keys(value.statusCodes as Record<string, unknown>).every(statusCode)
    && list(value.parameters, (v) => bodyProperty(v) && record(v) && ['query', 'path', 'header', 'cookie'].includes(v.in as string))
    && list(value.bodyProperties, bodyProperty)
    && list(value.responseProperties, (v) => bodyProperty(v) && record(v) && statusCode(v.statusCode))
    && strings(value.testRefs);
}
function acknowledged(value: unknown): boolean {
  return record(value) && string(value.label) && string(value.pattern) && count(value.count);
}
export function isCoverageResult(value: unknown): value is CoverageResult {
  return record(value) && strings(value.specFiles) && string(value.timestamp) && Number.isFinite(Date.parse(value.timestamp))
    && string(value.playwrightVersion) && string(value.playswagVersion) && count(value.totalTestCount)
    && isCoverageSummary(value.summary) && dictionary(value.tagCoverage, isCoverageSummary)
    && list(value.operations, operation) && list(value.uncoveredOperations, operation)
    && isEndpointHits(value.unmatchedHits) && list(value.acknowledgedHits, acknowledged);
}

/** Support reports predating response-property, tag and acknowledged-service coverage. */
export function normalizeCoverageResult(value: unknown): CoverageResult {
  if (!record(value)) throw new Error('Invalid playswag coverage report');
  const normalizeSummary = (summary: unknown): unknown => record(summary)
    ? { ...summary, responseProperties: summary.responseProperties === undefined ? { total: 0, covered: 0, percentage: 100 } : summary.responseProperties }
    : summary;
  const normalizeOperations = (operations: unknown): unknown => Array.isArray(operations)
    ? operations.map((op: unknown) => record(op) ? { ...op, responseProperties: op.responseProperties === undefined ? [] : op.responseProperties } : op)
    : operations;
  const normalized = {
    ...value,
    summary: normalizeSummary(value.summary),
    tagCoverage: value.tagCoverage === undefined ? {} : record(value.tagCoverage)
      ? Object.fromEntries(Object.entries(value.tagCoverage).map(([key, summary]) => [key, normalizeSummary(summary)])) : value.tagCoverage,
    operations: normalizeOperations(value.operations),
    uncoveredOperations: normalizeOperations(value.uncoveredOperations),
    acknowledgedHits: value.acknowledgedHits === undefined ? [] : value.acknowledgedHits,
  };
  if (!isCoverageResult(normalized)) throw new Error('Invalid playswag coverage report');
  return normalized;
}
