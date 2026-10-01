import { describe, expect, it } from 'vitest';
import { analyzeBodyProperties, analyzeResponseProperties } from '../../src/coverage/schema-analyzer.js';
import { calculateCoverage } from '../../src/coverage/calculator.js';
import type { EndpointHit, NormalizedOperation, NormalizedSchema } from '../../src/types.js';

function operation(schema: NormalizedSchema): NormalizedOperation {
  return { pathTemplate: '/items', method: 'POST', parameters: [], requestBodySchema: schema,
    responses: { '200': { schema } } };
}
function hit(statusCode: number, responseBody: unknown = {}): EndpointHit {
  return { url: '/items', method: 'POST', statusCode, responseBody, testFile: 'test.ts', testTitle: `status ${statusCode}` };
}
const item: NormalizedSchema = {
  type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id'],
};

describe('response resolution', () => {
  const op: NormalizedOperation = { ...operation({}), responses: {
    '200': { schema: { properties: { exact: {} } } },
    '2XX': { schema: { properties: { range: {} } } },
    default: { schema: { properties: { fallback: {} } } },
  } };
  it.each([
    [200, '200', 'exact'], [201, '2XX', 'range'], [503, 'default', 'fallback'],
  ])('counts %s only against %s and its response schema', (status, key, property) => {
    const result = calculateCoverage([hit(status, { [property]: true })], { sources: [], operations: [op] });
    const coverage = result.operations[0]!;
    expect(Object.keys(coverage.statusCodes).filter((code) => coverage.statusCodes[code]!.covered)).toEqual([key]);
    expect(coverage.responseProperties.filter((p) => p.covered)).toEqual([
      { statusCode: key, name: property, covered: true, required: false },
    ]);
    expect(result.summary.statusCodes.covered).toBe(1);
    expect(result.summary.responseProperties.covered).toBe(1);
  });

  it('does not fall back to a range schema when an exact response has no schema', () => {
    const exactWithoutSchema = { ...op, responses: { ...op.responses, '200': {} } };
    expect(analyzeResponseProperties(exactWithoutSchema, '200', { range: true })).toEqual([]);
  });
});

describe('schema-shaped arrays', () => {
  it('tracks top-level array items even without any recorded hits', () => {
    const op = operation({ type: 'array', items: item });
    const result = calculateCoverage([], { sources: [], operations: [op] });
    expect(result.summary.bodyProperties).toMatchObject({ total: 2, covered: 0, percentage: 0 });
    expect(result.summary.responseProperties).toMatchObject({ total: 2, covered: 0, percentage: 0 });
    expect(result.operations[0]!.responseProperties.map((p) => p.name)).toEqual(['[].id', '[].name']);
  });

  it('merges presence across all elements for both request and response arrays', () => {
    const op = operation({ type: 'array', items: item });
    const body = [{ id: '1' }, null, { name: 'second' }];
    expect(analyzeBodyProperties(op, JSON.stringify(body)).every((p) => p.covered)).toBe(true);
    expect(analyzeResponseProperties(op, '200', body).every((p) => p.covered)).toBe(true);
    expect(analyzeBodyProperties(op, []).every((p) => !p.covered)).toBe(true);
  });

  it('supports nested arrays and composed items within schemaDepth', () => {
    const op = operation({ properties: { groups: { type: 'array', items: {
      allOf: [{ properties: { users: { type: 'array', items: item } } }],
    } } } });
    const body = { groups: [{ users: [{ id: 1 }, { name: 'later' }] }] };
    const results = analyzeResponseProperties(op, '200', body, 3);
    expect(results.map((p) => p.name)).toEqual(['groups', 'groups[].users', 'groups[].users[].id', 'groups[].users[].name']);
    expect(results.every((p) => p.covered)).toBe(true);
    expect(analyzeBodyProperties(op, body, 1).map((p) => p.name)).toEqual(['groups']);
    expect(analyzeBodyProperties(op, body, Number.NaN)).toHaveLength(4);
  });

  it('excludes readOnly request fields and writeOnly response fields', () => {
    const op = operation({ properties: {
      id: { readOnly: true }, password: { writeOnly: true }, name: {},
    }, required: ['id', 'password'] });
    expect(analyzeBodyProperties(op, {}).map((p) => p.name)).toEqual(['password', 'name']);
    expect(analyzeResponseProperties(op, '200', {}).map((p) => p.name)).toEqual(['id', 'name']);
  });

  it('uses literal property names and own properties only', () => {
    const op = operation({ properties: { 'user.name': {}, inherited: {} } });
    const result = analyzeBodyProperties(op, Object.assign(Object.create({ inherited: true }), { 'user.name': 'x' }));
    expect(result).toEqual([
      { name: '["user.name"]', required: false, covered: true },
      { name: 'inherited', required: false, covered: false },
    ]);
  });
});

describe('bounded schema analysis', () => {
  it('handles a shared combiner DAG without exponential expansion', () => {
    let schema: NormalizedSchema = { properties: { name: {} } };
    for (let i = 0; i < 60; i++) schema = { allOf: [schema, schema] };
    expect(analyzeBodyProperties(operation(schema), { name: true })).toEqual([
      { name: 'name', required: false, covered: true },
    ]);
  });

  it('terminates cyclic combiners and follows recursive properties only to the configured depth', () => {
    const schema: NormalizedSchema = { properties: { name: {} } };
    schema.allOf = [schema];
    schema.properties!['next'] = schema;
    expect(analyzeBodyProperties(operation(schema), {}, 2).map((p) => p.name)).toEqual([
      'name', 'next', 'next.name', 'next.next',
    ]);
  });

  it('rejects excessive combiner nesting before exhausting the call stack', () => {
    let schema: NormalizedSchema = {};
    for (let i = 0; i < 140; i++) schema = { allOf: [schema] };
    expect(() => analyzeBodyProperties(operation(schema), {})).toThrow(/analysis depth limit/);
  });

  it('rejects schema expansion above the unique property budget', () => {
    const schema: NormalizedSchema = { properties: Object.fromEntries(
      Array.from({ length: 10_001 }, (_, index) => [`field${index}`, {}]),
    ) };
    expect(() => analyzeBodyProperties(operation(schema), {})).toThrow(/property count limit/);
  });
});
