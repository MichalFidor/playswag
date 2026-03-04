import { describe, it, expect } from 'vitest';
import { calculateCoverage } from '../../src/coverage/calculator.js';
import type { NormalizedSpec, EndpointHit } from '../../src/types.js';

const spec: NormalizedSpec = {
  sources: ['test-spec.yaml'],
  operations: [
    {
      pathTemplate: '/api/users',
      method: 'GET',
      parameters: [{ name: 'limit', in: 'query', required: false }],
      responses: { '200': {}, '400': {} },
    },
    {
      pathTemplate: '/api/users',
      method: 'POST',
      parameters: [],
      requestBodySchema: {
        type: 'object',
        properties: { name: { type: 'string' }, email: { type: 'string' } },
        required: ['name'],
      },
      responses: { '201': {}, '400': {}, '422': {} },
    },
    {
      pathTemplate: '/api/users/{id}',
      method: 'GET',
      parameters: [{ name: 'id', in: 'path', required: true }],
      responses: { '200': {}, '404': {} },
    },
    {
      pathTemplate: '/api/users/{id}',
      method: 'DELETE',
      parameters: [{ name: 'id', in: 'path', required: true }],
      responses: { '204': {}, '404': {} },
    },
  ],
};

function hit(overrides: Partial<EndpointHit> & Pick<EndpointHit, 'method' | 'url' | 'statusCode'>): EndpointHit {
  return {
    testFile: 'test.spec.ts',
    testTitle: 'test title',
    ...overrides,
  };
}

describe('calculateCoverage', () => {
  const baseURL = 'https://api.example.com';

  it('marks a matched operation as covered', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200 })],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.covered).toBe(true);
  });

  it('marks unmatched operations as uncovered', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200 })],
      spec,
      { baseURL }
    );
    const deleteOp = result.operations.find((o) => o.path === '/api/users/{id}' && o.method === 'DELETE');
    expect(deleteOp?.covered).toBe(false);
    expect(result.uncoveredOperations).toContain(deleteOp);
  });

  it('tracks exercised status codes', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 400 })],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.statusCodes['400']?.covered).toBe(true);
    expect(op?.statusCodes['200']?.covered).toBe(false);
  });

  it('tracks body property coverage for POST', () => {
    const result = calculateCoverage(
      [
        hit({
          method: 'POST',
          url: `${baseURL}/api/users`,
          statusCode: 201,
          requestBody: { name: 'Alice' }, // no email
        }),
      ],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'POST');
    expect(op?.bodyProperties.find((b) => b.name === 'name')?.covered).toBe(true);
    expect(op?.bodyProperties.find((b) => b.name === 'email')?.covered).toBe(false);
  });

  it('accumulates coverage across multiple hits', () => {
    const result = calculateCoverage(
      [
        hit({ method: 'POST', url: `${baseURL}/api/users`, statusCode: 201, requestBody: { name: 'A' } }),
        hit({ method: 'POST', url: `${baseURL}/api/users`, statusCode: 422, requestBody: { name: 'A', email: 'a@b.com' } }),
      ],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'POST');
    expect(op?.statusCodes['201']?.covered).toBe(true);
    expect(op?.statusCodes['422']?.covered).toBe(true);
    expect(op?.statusCodes['400']?.covered).toBe(false);
    expect(op?.bodyProperties.find((b) => b.name === 'email')?.covered).toBe(true);
  });

  it('puts unmatched hits into unmatchedHits', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/nonexistent`, statusCode: 200 })],
      spec,
      { baseURL }
    );
    expect(result.unmatchedHits).toHaveLength(1);
    expect(result.unmatchedHits[0]?.url).toContain('nonexistent');
  });

  it('calculates summary percentages correctly', () => {
    // Cover 2 of 4 operations
    const result = calculateCoverage(
      [
        hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200 }),
        hit({ method: 'POST', url: `${baseURL}/api/users`, statusCode: 201 }),
      ],
      spec,
      { baseURL }
    );
    expect(result.summary.endpoints.total).toBe(4);
    expect(result.summary.endpoints.covered).toBe(2);
    expect(result.summary.endpoints.percentage).toBe(50);
  });

  it('includes test references on covered operations', () => {
    const result = calculateCoverage(
      [
        hit({
          method: 'GET',
          url: `${baseURL}/api/users`,
          statusCode: 200,
          testFile: 'users.spec.ts',
          testTitle: 'list users',
        }),
      ],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.testRefs).toContain('users.spec.ts > list users');
  });

  it('matches when operations have a serverBasePath and URLs include that prefix', () => {
    const specWithBasePath: NormalizedSpec = {
      ...spec,
      operations: spec.operations.map(op => ({ ...op, serverBasePath: '/api-base' })),
    };
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api-base/api/users`, statusCode: 200 })],
      specWithBasePath,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.covered).toBe(true);
    expect(result.unmatchedHits).toHaveLength(0);
  });

  it('leaves unmatched hits when serverBasePath does not help', () => {
    const specWithBasePath: NormalizedSpec = {
      ...spec,
      operations: spec.operations.map(op => ({ ...op, serverBasePath: '/api-base' })),
    };
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/other-prefix/api/users`, statusCode: 200 })],
      specWithBasePath,
      { baseURL }
    );
    expect(result.unmatchedHits).toHaveLength(1);
  });
});
