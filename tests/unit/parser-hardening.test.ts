import { afterEach, describe, expect, it, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import { parseSpecs } from '../../src/openapi/parser.js';

let source = 0;
async function parseDocument(document: unknown, url = `/test-spec-${++source}.json`) {
  vi.spyOn(SwaggerParser, 'dereference').mockResolvedValue(document as OpenAPI.Document);
  return parseSpecs(url, { allowedSpecHosts: ['example.com'] });
}
function documentWithSchema(schema: unknown) {
  return { openapi: '3.0.3', info: { title: 'Test', version: '1' }, paths: {
    '/users': { get: { responses: { '200': { content: { 'application/json': { schema } } } } } },
  } };
}
afterEach(() => vi.restoreAllMocks());

describe('bounded schema normalization', () => {
  it('retains shared references instead of expanding an exponential allOf DAG', async () => {
    let schema: Record<string, unknown> = { properties: { id: {} } };
    for (let i = 0; i < 60; i++) schema = { allOf: [schema, schema] };
    const spec = await parseDocument(documentWithSchema(schema));
    let normalized = spec.operations[0]!.responses['200']!.schema!;
    for (let i = 0; i < 60; i++) {
      expect(normalized.allOf![0]).toBe(normalized.allOf![1]);
      normalized = normalized.allOf![0]!;
    }
    expect(normalized.properties).toHaveProperty('id');
  });

  it('keeps cycles finite and preserves readOnly/writeOnly flags', async () => {
    const schema: Record<string, unknown> = { properties: { id: { readOnly: true }, password: { writeOnly: true } } };
    (schema['properties'] as Record<string, unknown>)['next'] = schema;
    const spec = await parseDocument(documentWithSchema(schema));
    const normalized = spec.operations[0]!.responses['200']!.schema!;
    expect(normalized.properties!['next']).toBe(normalized);
    expect(normalized.properties!['id']?.readOnly).toBe(true);
    expect(normalized.properties!['password']?.writeOnly).toBe(true);
  });

  it('rejects excessive nesting with an actionable error', async () => {
    let schema: Record<string, unknown> = { type: 'string' };
    for (let i = 0; i < 140; i++) schema = { allOf: [schema] };
    await expect(parseDocument(documentWithSchema(schema))).rejects.toThrow(/normalization complexity limit/);
  });
});

describe('server inheritance', () => {
  it('supports relative paths and lets root-level overrides remove a document prefix', async () => {
    const doc = { openapi: '3.0.3', info: { title: 'Test', version: '1' }, servers: [{ url: '/api/v1' }], paths: {
      '/inherited': { get: { responses: {} } },
      '/path': { servers: [{ url: '/path-base/' }], get: { responses: {} } },
      '/root': { servers: [{ url: '/path-base' }], get: { servers: [{ url: '/' }], responses: {} } },
      '/absolute-root': { get: { servers: [{ url: 'https://example.com/' }], responses: {} } },
    } };
    const spec = await parseDocument(doc);
    expect(spec.operations.map((operation) => operation.serverBasePath)).toEqual([
      '/api/v1', '/path-base', undefined, undefined,
    ]);
  });

  it('resolves relative server URLs against the remote specification URL', async () => {
    const doc = { ...documentWithSchema({}), servers: [{ url: '../v2' }] };
    const spec = await parseDocument(doc, 'https://example.com/specs/openapi.json');
    expect(spec.operations[0]!.serverBasePath).toBe('/v2');
  });

  it('allows empty default server variables', async () => {
    const doc = { ...documentWithSchema({}), servers: [{ url: '/{version}', variables: { version: { default: '' } } }] };
    const spec = await parseDocument(doc);
    expect(spec.operations[0]!.serverBasePath).toBeUndefined();
  });
});
