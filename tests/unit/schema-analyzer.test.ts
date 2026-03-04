import { describe, it, expect } from 'vitest';
import { analyzeParameters, analyzeBodyProperties } from '../../src/coverage/schema-analyzer.js';
import type { NormalizedOperation } from '../../src/types.js';

const baseOp: NormalizedOperation = {
  pathTemplate: '/api/users/{id}',
  method: 'GET',
  parameters: [
    { name: 'id', in: 'path', required: true },
    { name: 'include', in: 'query', required: false },
    { name: 'X-Trace-Id', in: 'header', required: false },
  ],
  responses: {},
};

const postOp: NormalizedOperation = {
  pathTemplate: '/api/users',
  method: 'POST',
  parameters: [{ name: 'dryRun', in: 'query', required: false }],
  requestBodySchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
      role: { type: 'string' },
    },
    required: ['name', 'email'],
  },
  responses: {},
};

describe('analyzeParameters', () => {
  it('marks path param as covered when present in pathParams', () => {
    const result = analyzeParameters(baseOp, undefined, { id: '123' }, undefined);
    const idParam = result.find((p) => p.name === 'id');
    expect(idParam?.covered).toBe(true);
  });

  it('marks query param as covered when present', () => {
    const result = analyzeParameters(baseOp, { include: 'posts' }, { id: '1' }, undefined);
    const includeParam = result.find((p) => p.name === 'include');
    expect(includeParam?.covered).toBe(true);
  });

  it('marks header param as covered (case-insensitive)', () => {
    const result = analyzeParameters(baseOp, undefined, { id: '1' }, { 'x-trace-id': 'abc' });
    const headerParam = result.find((p) => p.name === 'X-Trace-Id');
    expect(headerParam?.covered).toBe(true);
  });

  it('marks params as uncovered when not supplied', () => {
    const result = analyzeParameters(baseOp, undefined, { id: '1' }, undefined);
    const includeParam = result.find((p) => p.name === 'include');
    expect(includeParam?.covered).toBe(false);
  });

  it('returns empty array for an operation with no parameters', () => {
    const op: NormalizedOperation = { pathTemplate: '/', method: 'GET', parameters: [], responses: {} };
    expect(analyzeParameters(op, {}, {}, {})).toEqual([]);
  });

  it('cookie parameters are always uncovered', () => {
    const op: NormalizedOperation = {
      pathTemplate: '/api/login',
      method: 'POST',
      parameters: [{ name: 'session', in: 'cookie', required: false }],
      responses: {},
    };
    // Even when a matching key is present in query params the cookie param stays uncovered
    const result = analyzeParameters(op, { session: '123' }, {}, {});
    expect(result[0]?.covered).toBe(false);
  });
});

describe('analyzeBodyProperties', () => {
  it('marks covered properties as covered', () => {
    const body = { name: 'Alice', email: 'alice@example.com' };
    const result = analyzeBodyProperties(postOp, body);
    expect(result.find((b) => b.name === 'name')?.covered).toBe(true);
    expect(result.find((b) => b.name === 'email')?.covered).toBe(true);
  });

  it('marks missing properties as uncovered', () => {
    const body = { name: 'Alice', email: 'alice@example.com' }; // no role
    const result = analyzeBodyProperties(postOp, body);
    expect(result.find((b) => b.name === 'role')?.covered).toBe(false);
  });

  it('marks required properties correctly', () => {
    const body = { name: 'Alice' };
    const result = analyzeBodyProperties(postOp, body);
    expect(result.find((b) => b.name === 'name')?.required).toBe(true);
    expect(result.find((b) => b.name === 'role')?.required).toBe(false);
  });

  it('returns empty array when schema has no properties', () => {
    const op: NormalizedOperation = {
      pathTemplate: '/ping',
      method: 'GET',
      parameters: [],
      responses: {},
    };
    expect(analyzeBodyProperties(op, { foo: 'bar' })).toEqual([]);
  });

  it('parses JSON string body', () => {
    const result = analyzeBodyProperties(postOp, JSON.stringify({ name: 'Bob', email: 'b@b.com' }));
    expect(result.find((b) => b.name === 'name')?.covered).toBe(true);
    expect(result.find((b) => b.name === 'role')?.covered).toBe(false);
  });

  it('returns all uncovered when body is undefined', () => {
    const result = analyzeBodyProperties(postOp, undefined);
    expect(result).toHaveLength(3); // name, email, role
    expect(result.every((b) => !b.covered)).toBe(true);
  });

  it('returns all uncovered when body is null', () => {
    const result = analyzeBodyProperties(postOp, null);
    expect(result.every((b) => !b.covered)).toBe(true);
  });

  it('returns all uncovered when body is an array (not a plain object)', () => {
    const result = analyzeBodyProperties(postOp, [{ name: 'Alice' }]);
    expect(result.every((b) => !b.covered)).toBe(true);
  });

  it('returns all uncovered when body is an invalid JSON string', () => {
    const result = analyzeBodyProperties(postOp, 'not-json-at-all{{');
    expect(result.every((b) => !b.covered)).toBe(true);
  });

  it('merges properties from allOf sub-schemas', () => {
    const op: NormalizedOperation = {
      pathTemplate: '/api/widgets',
      method: 'POST',
      parameters: [],
      requestBodySchema: {
        allOf: [
          { type: 'object', properties: { name: { type: 'string' } } },
          { type: 'object', properties: { weight: { type: 'number' } }, required: ['weight'] },
        ],
      },
      responses: {},
    };
    const result = analyzeBodyProperties(op, { name: 'Widget A' });
    expect(result.find((b) => b.name === 'name')?.covered).toBe(true);
    expect(result.find((b) => b.name === 'weight')?.covered).toBe(false);
    expect(result.find((b) => b.name === 'weight')?.required).toBe(true);
  });
});
