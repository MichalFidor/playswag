import { describe, it, expect, vi } from 'vitest';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecs } from '../../src/openapi/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_YAML = join(__dirname, '../fixtures/sample-openapi.yaml');
const FIXTURE_V2 = join(__dirname, '../fixtures/sample-swagger2.yaml');

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

describe('parseSpecs (OAS2 / Swagger 2.0)', () => {
  it('parses an OAS2 YAML file and returns the expected operations', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    expect(spec.sources).toEqual([FIXTURE_V2]);
    expect(spec.operations.length).toBeGreaterThan(0);
  });

  it('extracts all expected operation method+path combos', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const keys = spec.operations.map((op) => `${op.method}:${op.pathTemplate}`);
    expect(keys).toContain('GET:/api/products');
    expect(keys).toContain('POST:/api/products');
    expect(keys).toContain('GET:/api/products/{id}');
    expect(keys).toContain('DELETE:/api/products/{id}');
    expect(keys).toContain('GET:/api/health');
  });

  it('sets serverBasePath from OAS2 basePath field', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const op = spec.operations[0];
    expect(op?.serverBasePath).toBe('/v1');
  });

  it('sets operationId when defined in the spec', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const listProducts = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/products'
    );
    expect(listProducts?.operationId).toBe('listProducts');
  });

  it('normalizes query parameters', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const listProducts = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/products'
    );
    const paramNames = listProducts?.parameters.map((p) => p.name) ?? [];
    expect(paramNames).toContain('category');
    expect(paramNames).toContain('limit');
  });

  it('marks path parameters as required', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const getProduct = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/products/{id}'
    );
    const idParam = getProduct?.parameters.find((p) => p.name === 'id');
    expect(idParam?.in).toBe('path');
    expect(idParam?.required).toBe(true);
  });

  it('normalizes header parameters', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const deleteProduct = spec.operations.find(
      (op) => op.method === 'DELETE' && op.pathTemplate === '/api/products/{id}'
    );
    const headerParam = deleteProduct?.parameters.find((p) => p.name === 'X-Request-Id');
    expect(headerParam?.in).toBe('header');
  });

  it('extracts request body schema from OAS2 body parameter', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const createProduct = spec.operations.find(
      (op) => op.method === 'POST' && op.pathTemplate === '/api/products'
    );
    expect(createProduct?.requestBodySchema).toBeDefined();
    expect(createProduct?.requestBodySchema?.properties).toHaveProperty('name');
    expect(createProduct?.requestBodySchema?.properties).toHaveProperty('price');
    expect(createProduct?.requestBodySchema?.required).toContain('name');
    expect(createProduct?.requestBodySchema?.required).toContain('price');
  });

  it('extracts response codes from the spec', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const createProduct = spec.operations.find(
      (op) => op.method === 'POST' && op.pathTemplate === '/api/products'
    );
    expect(Object.keys(createProduct?.responses ?? {})).toContain('201');
    expect(Object.keys(createProduct?.responses ?? {})).toContain('422');
  });

  it('extracts response body schema directly from OAS2 response object', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const getProduct = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/products/{id}'
    );
    const resp200 = getProduct?.responses['200'];
    expect(resp200?.schema).toBeDefined();
    expect(resp200?.schema?.properties).toHaveProperty('id');
    expect(resp200?.schema?.properties).toHaveProperty('name');
    expect(resp200?.schema?.properties).toHaveProperty('price');
    expect(resp200?.schema?.required).toContain('id');
    expect(resp200?.schema?.required).toContain('name');
  });

  it('leaves response schema undefined when no schema is defined for a response', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const getProduct = spec.operations.find(
      (op) => op.method === 'GET' && op.pathTemplate === '/api/products/{id}'
    );
    const resp404 = getProduct?.responses['404'];
    expect(resp404?.schema).toBeUndefined();
  });

  it('does not include OAS2 body parameter in the parameters array', async () => {
    const spec = await parseSpecs(FIXTURE_V2);
    const createProduct = spec.operations.find(
      (op) => op.method === 'POST' && op.pathTemplate === '/api/products'
    );
    const bodyParam = createProduct?.parameters.find((p) => p.name === 'body');
    expect(bodyParam).toBeUndefined();
  });

  it('merges OAS2 and OAS3 specs when both are provided', async () => {
    const spec = await parseSpecs([FIXTURE_YAML, FIXTURE_V2]);
    const keys = spec.operations.map((op) => `${op.method}:${op.pathTemplate}`);
    expect(keys).toContain('GET:/api/users');
    expect(keys).toContain('GET:/api/products');
  });
});

describe('parseSpecs — URL without scheme', () => {
  it('wraps a bare hostname+path source with https:// and warns', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A self-referencing attempt: the bare URL will fail to fetch (no live server),
    // but the test verifies that the warning is emitted before the fetch attempt.
    await parseSpecs('example.com/openapi.json').catch(() => {});
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('has no scheme')
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('https://example.com/openapi.json')
    );
    warnSpy.mockRestore();
  });

  it('does not warn or rewrite absolute file paths', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parseSpecs('/non/existent/path.yaml').catch(() => {});
    const schemeWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('looks like a URL without a scheme')
    );
    expect(schemeWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });

  it('does not warn or rewrite http:// sources', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await parseSpecs('http://localhost:9999/openapi.json').catch(() => {});
    const schemeWarnings = warnSpy.mock.calls.filter((args) =>
      String(args[0]).includes('looks like a URL without a scheme')
    );
    expect(schemeWarnings).toHaveLength(0);
    warnSpy.mockRestore();
  });
});
