import { describe, it, expect } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../../src/openapi/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_YAML = join(__dirname, '../fixtures/sample-openapi.yaml');

describe('parseSpecs', () => {
  it('parses an OAS3 YAML file and returns the expected operations', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    expect(spec.sources).toEqual([FIXTURE_YAML]);
    expect(spec.operations.length).toBeGreaterThan(0);
  });

  it('extracts all expected operation method+path combos', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const keys = spec.operations.map((op) => `${op.method}:${op.pathTemplate}`);
    expect(keys).toContain('GET:/api/users');
    expect(keys).toContain('POST:/api/users');
    expect(keys).toContain('GET:/api/users/{id}');
    expect(keys).toContain('DELETE:/api/users/{id}');
    expect(keys).toContain('GET:/api/health');
  });

  it('sets operationId when defined in the spec', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const listUsers = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/users'
    );
    expect(listUsers?.operationId).toBe('listUsers');
  });

  it('normalizes query parameters for listUsers', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const listUsers = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/users'
    );
    const paramNames = listUsers?.parameters.map((p) => p.name) ?? [];
    expect(paramNames).toContain('limit');
    expect(paramNames).toContain('offset');
  });

  it('marks path parameters as required', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const getUser = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/users/{id}'
    );
    const idParam = getUser?.parameters.find((p) => p.name === 'id');
    expect(idParam?.in).toBe('path');
    expect(idParam?.required).toBe(true);
  });

  it('extracts response codes from the spec', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const createUser = spec.operations.find(
      (op) => op.method === 'POST' && op.pathTemplate === '/api/users'
    );
    expect(Object.keys(createUser?.responses ?? {})).toContain('201');
    expect(Object.keys(createUser?.responses ?? {})).toContain('422');
  });

  it('extracts requestBodySchema for POST /api/users', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const createUser = spec.operations.find(
      (op) => op.method === 'POST' && op.pathTemplate === '/api/users'
    );
    expect(createUser?.requestBodySchema).toBeDefined();
    expect(createUser?.requestBodySchema?.properties).toHaveProperty('name');
    expect(createUser?.requestBodySchema?.properties).toHaveProperty('email');
  });

  it('strips server base path from the server URL', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    // The fixture has servers[0].url = 'http://localhost:3456' — no path component,
    // so serverBasePath should be undefined (not '/')
    const op = spec.operations[0];
    expect(op?.serverBasePath).toBeUndefined();
  });

  it('accepts an array of sources', async () => {
    const spec = await parseSpecs([FIXTURE_YAML]);
    expect(spec.sources).toHaveLength(1);
    expect(spec.operations.length).toBeGreaterThan(0);
  });

  it('throws a [playswag]-prefixed error for a non-existent file', async () => {
    await expect(parseSpecs('/non/existent/path.yaml')).rejects.toThrow('[playswag]');
  });

  it('warns and de-duplicates operations when the same spec is passed twice', async () => {
    // Passing the same file twice should deduplicate and warn (not throw)
    const spec = await parseSpecs([FIXTURE_YAML, FIXTURE_YAML]);
    // Should still have the same operations (not doubled)
    const specSingle = await parseSpecs(FIXTURE_YAML);
    expect(spec.operations.length).toBe(specSingle.operations.length);
  });

  it('extracts response body schema from OAS3 content[application/json].schema', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const getUser = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/users/{id}'
    );
    const resp200 = getUser?.responses['200'];
    expect(resp200?.schema).toBeDefined();
    expect(resp200?.schema?.properties).toHaveProperty('id');
    expect(resp200?.schema?.properties).toHaveProperty('name');
    expect(resp200?.schema?.properties).toHaveProperty('email');
    expect(resp200?.schema?.required).toContain('id');
    expect(resp200?.schema?.required).toContain('name');
  });

  it('leaves response schema undefined when no schema is defined for a response', async () => {
    const spec = await parseSpecs(FIXTURE_YAML);
    const getUser = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/users/{id}'
    );
    // 404 response has no schema in the fixture
    const resp404 = getUser?.responses['404'];
    expect(resp404?.schema).toBeUndefined();
  });
});
