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

  it('returns all operations uncovered and empty unmatchedHits when given no hits', () => {
    const result = calculateCoverage([], spec, { baseURL });
    expect(result.summary.endpoints.covered).toBe(0);
    expect(result.summary.endpoints.total).toBe(4);
    expect(result.uncoveredOperations).toHaveLength(4);
    expect(result.unmatchedHits).toHaveLength(0);
  });

  it('counts total parameters correctly across all operations', () => {
    // GET /api/users: 1 (limit), POST /api/users: 0,
    // GET /api/users/{id}: 1 (id), DELETE /api/users/{id}: 1 (id) → 3 total
    const result = calculateCoverage([], spec, { baseURL });
    expect(result.summary.parameters.total).toBe(3);
    expect(result.summary.parameters.covered).toBe(0);
  });

  it('reports 100% and total=0 for dimensions with no items defined in spec', () => {
    const bareSpec: NormalizedSpec = {
      sources: ['bare.yaml'],
      operations: [
        { pathTemplate: '/ping', method: 'GET', parameters: [], responses: { '200': {} } },
      ],
    };
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/ping`, statusCode: 200 })],
      bareSpec,
      { baseURL }
    );
    expect(result.summary.parameters.total).toBe(0);
    expect(result.summary.parameters.percentage).toBe(100);
    expect(result.summary.bodyProperties.total).toBe(0);
    expect(result.summary.bodyProperties.percentage).toBe(100);
  });

  it('tracks query parameter coverage from hit.queryParams', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200, queryParams: { limit: '10' } })],
      spec,
      { baseURL }
    );
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.parameters.find((p) => p.name === 'limit')?.covered).toBe(true);
  });

  it('requiredParamsOnly: excludes optional parameters from tracking', () => {
    // GET /api/users has 1 optional (limit); with requiredParamsOnly it should have 0 params
    const result = calculateCoverage([], spec, { baseURL, requiredParamsOnly: true });
    const op = result.operations.find((o) => o.path === '/api/users' && o.method === 'GET');
    expect(op?.parameters).toHaveLength(0);
  });

  it('requiredParamsOnly: keeps required parameters', () => {
    // GET /api/users/{id} has 1 required (id); with requiredParamsOnly it stays
    const result = calculateCoverage([], spec, { baseURL, requiredParamsOnly: true });
    const op = result.operations.find((o) => o.path === '/api/users/{id}' && o.method === 'GET');
    expect(op?.parameters).toHaveLength(1);
    expect(op?.parameters[0]?.name).toBe('id');
    expect(op?.parameters[0]?.required).toBe(true);
  });

  it('requiredParamsOnly: summary.parameters.total counts only required params', () => {
    // Spec has optional: limit (GET /api/users); required: id×2 (GET+DELETE /api/users/{id})
    // With requiredParamsOnly the total should be 2 (id params only)
    const result = calculateCoverage([], spec, { baseURL, requiredParamsOnly: true });
    expect(result.summary.parameters.total).toBe(2);
  });

  it('requiredParamsOnly: false (default) includes all params', () => {
    const result = calculateCoverage([], spec, { baseURL, requiredParamsOnly: false });
    // total: limit(1) + id(2) = 3
    expect(result.summary.parameters.total).toBe(3);
  });
});

// ─── tagCoverage ─────────────────────────────────────────────────────────────

describe('tagCoverage', () => {
  const baseURL = 'https://api.example.com';

  const taggedSpec: NormalizedSpec = {
    sources: ['tagged.yaml'],
    operations: [
      {
        pathTemplate: '/api/users',
        method: 'GET',
        tags: ['users'],
        parameters: [],
        responses: { '200': {}, '400': {} },
      },
      {
        pathTemplate: '/api/users',
        method: 'POST',
        tags: ['users'],
        parameters: [],
        requestBodySchema: {
          type: 'object',
          properties: { name: { type: 'string' } },
          required: ['name'],
        },
        responses: { '201': {}, '400': {} },
      },
      {
        pathTemplate: '/api/health',
        method: 'GET',
        tags: ['system'],
        parameters: [],
        responses: { '200': {} },
      },
    ],
  };

  it('aggregates endpoints per tag', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200 })],
      taggedSpec,
      { baseURL }
    );
    expect(result.tagCoverage['users']?.endpoints.total).toBe(2);
    expect(result.tagCoverage['users']?.endpoints.covered).toBe(1);
    expect(result.tagCoverage['system']?.endpoints.total).toBe(1);
    expect(result.tagCoverage['system']?.endpoints.covered).toBe(0);
  });

  it('marks a tag as fully covered when all its operations are hit', () => {
    const result = calculateCoverage(
      [
        hit({ method: 'GET',  url: `${baseURL}/api/users`, statusCode: 200 }),
        hit({ method: 'POST', url: `${baseURL}/api/users`, statusCode: 201 }),
        hit({ method: 'GET',  url: `${baseURL}/api/health`, statusCode: 200 }),
      ],
      taggedSpec,
      { baseURL }
    );
    expect(result.tagCoverage['users']?.endpoints.percentage).toBe(100);
    expect(result.tagCoverage['system']?.endpoints.percentage).toBe(100);
  });

  it('places operations without tags under "(untagged)"', () => {
    const untaggedSpec: NormalizedSpec = {
      sources: ['bare.yaml'],
      operations: [
        { pathTemplate: '/api/ping', method: 'GET', parameters: [], responses: { '200': {} } },
      ],
    };
    const result = calculateCoverage([], untaggedSpec, { baseURL });
    expect(result.tagCoverage['(untagged)']).toBeDefined();
    expect(result.tagCoverage['(untagged)']?.endpoints.total).toBe(1);
  });

  it('aggregates status code coverage per tag', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users`, statusCode: 200 })],
      taggedSpec,
      { baseURL }
    );
    // users tag: 4 total status codes (200+400 for GET, 201+400 for POST), 1 covered (200)
    expect(result.tagCoverage['users']?.statusCodes.total).toBe(4);
    expect(result.tagCoverage['users']?.statusCodes.covered).toBe(1);
  });
});

// ─── response property coverage ──────────────────────────────────────────────

describe('response property coverage', () => {
  const baseURL = 'https://api.example.com';

  const specWithResponseSchema: NormalizedSpec = {
    sources: ['resp-spec.yaml'],
    operations: [
      {
        pathTemplate: '/api/users/{id}',
        method: 'GET',
        parameters: [{ name: 'id', in: 'path', required: true }],
        responses: {
          '200': {
            schema: {
              type: 'object',
              properties: {
                id:    { type: 'string' },
                name:  { type: 'string' },
                email: { type: 'string' },
              },
              required: ['id', 'name'],
            },
          },
          '404': {
            schema: {
              type: 'object',
              properties: { message: { type: 'string' } },
              required: ['message'],
            },
          },
        },
      },
    ],
  };

  it('pre-seeds responseProperties from all response schemas even without hits', () => {
    const result = calculateCoverage([], specWithResponseSchema, { baseURL });
    const op = result.operations[0]!;
    // 3 props from 200 + 1 prop from 404 = 4 total
    expect(op.responseProperties).toHaveLength(4);
    expect(op.responseProperties.every((r) => !r.covered)).toBe(true);
    expect(result.summary.responseProperties.total).toBe(4);
    expect(result.summary.responseProperties.covered).toBe(0);
  });

  it('marks response properties as covered based on responseBody in hit', () => {
    const result = calculateCoverage(
      [
        hit({
          method: 'GET',
          url: `${baseURL}/api/users/1`,
          statusCode: 200,
          responseBody: { id: '1', name: 'Alice' }, // email not present
        }),
      ],
      specWithResponseSchema,
      { baseURL }
    );
    const op = result.operations[0]!;
    const props200 = op.responseProperties.filter((r) => r.statusCode === '200');
    expect(props200.find((r) => r.name === 'id')?.covered).toBe(true);
    expect(props200.find((r) => r.name === 'name')?.covered).toBe(true);
    expect(props200.find((r) => r.name === 'email')?.covered).toBe(false);
    expect(result.summary.responseProperties.covered).toBe(2);
  });

  it('accumulates coverage across multiple hits for different status codes', () => {
    const result = calculateCoverage(
      [
        hit({ method: 'GET', url: `${baseURL}/api/users/1`, statusCode: 200, responseBody: { id: '1', name: 'Alice', email: 'a@b.com' } }),
        hit({ method: 'GET', url: `${baseURL}/api/users/999`, statusCode: 404, responseBody: { message: 'Not found' } }),
      ],
      specWithResponseSchema,
      { baseURL }
    );
    expect(result.summary.responseProperties.total).toBe(4);
    expect(result.summary.responseProperties.covered).toBe(4);
    expect(result.summary.responseProperties.percentage).toBe(100);
  });

  it('leaves response properties uncovered when responseBody is missing', () => {
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/api/users/1`, statusCode: 200 })],
      specWithResponseSchema,
      { baseURL }
    );
    const op = result.operations[0]!;
    expect(op.responseProperties.filter((r) => r.statusCode === '200').every((r) => !r.covered)).toBe(true);
  });

  it('reports 100% and total=0 when no responses have schemas', () => {
    const noSchemaSpec: NormalizedSpec = {
      sources: ['bare.yaml'],
      operations: [
        { pathTemplate: '/ping', method: 'GET', parameters: [], responses: { '200': {} } },
      ],
    };
    const result = calculateCoverage(
      [hit({ method: 'GET', url: `${baseURL}/ping`, statusCode: 200, responseBody: {} })],
      noSchemaSpec,
      { baseURL }
    );
    expect(result.summary.responseProperties.total).toBe(0);
    expect(result.summary.responseProperties.percentage).toBe(100);
  });
});

