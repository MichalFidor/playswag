import { afterEach, describe, expect, it, vi } from 'vitest';
import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI } from 'openapi-types';
import { calculateCoverage } from '../../src/coverage/calculator.js';
import { analyzeBodyProperties, analyzeParameters } from '../../src/coverage/schema-analyzer.js';
import { parseSpecs } from '../../src/openapi/parser.js';
import { matchOperation, buildOperationIndex } from '../../src/openapi/matcher.js';
import type { EndpointHit, NormalizedOperation, NormalizedSchema } from '../../src/types.js';

function operation(schema: NormalizedSchema): NormalizedOperation {
  return { method: 'POST', pathTemplate: '/items', parameters: [], requestBodySchema: schema, responses: { '200': { schema } } };
}
function hit(body: unknown): EndpointHit {
  return { method: 'POST', url: '/items', statusCode: 200, requestBody: body, responseBody: body, testFile: 'review.ts', testTitle: 'covers properties' };
}
afterEach(() => vi.restoreAllMocks());

describe('coverage review regressions', () => {
  it('does not reuse a cycle-pruned combiner under a different property prefix', () => {
    const a: NormalizedSchema = { properties: { a: {} } };
    const b: NormalizedSchema = { properties: { b: {} }, allOf: [a] };
    a.allOf = [b];
    const op = operation({ properties: { left: a, right: b } });
    const properties = analyzeBodyProperties(op, { left: { a: 1, b: 2 }, right: { a: 3, b: 4 } });
    expect(properties.map((property) => property.name).sort()).toEqual([
      'left', 'left.a', 'left.b', 'right', 'right.a', 'right.b',
    ]);
    expect(properties.every((property) => property.covered)).toBe(true);
    const reversed = analyzeBodyProperties(operation({ properties: { right: b, left: a } }), {});
    expect(reversed.map((property) => property.name).sort()).toEqual(properties.map((property) => property.name).sort());
  });

  it('tracks literal dotted and bracketed keys separately from nested and array properties', () => {
    const schema: NormalizedSchema = { properties: {
      'a.b': {},
      a: { properties: { b: {} } },
      'rows[].id': {},
      rows: { type: 'array', items: { properties: { id: {} } } },
      '': {},
    } };
    const op = operation(schema);
    const nestedOnly = calculateCoverage([hit({ a: { b: true }, rows: [{ id: 1 }] })], { sources: [], operations: [op] });
    expect(nestedOnly.operations[0]!.bodyProperties.filter((property) => property.covered).map((property) => property.name)).toEqual([
      'a', 'a.b', 'rows', 'rows[].id',
    ]);
    expect(nestedOnly.summary.bodyProperties).toMatchObject({ total: 7, covered: 4 });
    const all = calculateCoverage([
      hit({ a: { b: true }, rows: [{ id: 1 }] }), hit({ 'a.b': true, 'rows[].id': 2, '': true }),
    ], { sources: [], operations: [op] });
    expect(all.summary.bodyProperties).toEqual({ total: 7, covered: 7, percentage: 100 });
    expect(all.summary.responseProperties).toEqual({ total: 7, covered: 7, percentage: 100 });
    expect(new Set(all.operations[0]!.bodyProperties.map((property) => property.name)).size).toBe(7);
  });

  it('excludes response extensions from status and response-property denominators', async () => {
    const document: unknown = { openapi: '3.0.3', info: { title: 'Synthetic', version: '1' }, paths: {
      '/items': { post: { responses: {
        '200': { description: 'exact' },
        '2XX': { description: 'range' },
        default: { description: 'fallback' },
        'x-metadata': { schema: { properties: { internal: {} } } },
      } } },
    } };
    vi.spyOn(SwaggerParser, 'dereference').mockResolvedValue(document as OpenAPI.Document);
    const spec = await parseSpecs('/synthetic-response-extensions-review.json');
    const result = calculateCoverage([hit({})], spec);
    expect(Object.keys(spec.operations[0]!.responses)).toEqual(['200', '2XX', 'default']);
    expect(result.summary.statusCodes).toMatchObject({ total: 3, covered: 1 });
    expect(result.summary.responseProperties.total).toBe(0);
  });

  it.each([false, true])('retains prototype-like path parameters as own fields (indexed=%s)', (indexed) => {
    const op: NormalizedOperation = { method: 'GET', pathTemplate: '/items/{__proto__}', responses: {}, parameters: [
      { in: 'path', name: '__proto__', required: true },
    ] };
    const match = matchOperation('/items/123', 'GET', [op], undefined, indexed ? buildOperationIndex([op]) : undefined);
    expect(Object.hasOwn(match!.pathParams, '__proto__')).toBe(true);
    expect(analyzeParameters(op, undefined, match!.pathParams, undefined)[0]?.covered).toBe(true);
  });
});
