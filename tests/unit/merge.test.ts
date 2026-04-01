import { describe, it, expect } from 'vitest';
import { mergeCoverageResults } from '../../src/merge.js';
import type {
  CoverageResult,
  OperationCoverage,
} from '../../src/types.js';

function makeOp(overrides: Partial<OperationCoverage> = {}): OperationCoverage {
  return {
    path: '/users',
    method: 'GET',
    covered: false,
    statusCodes: { '200': { covered: false, testRefs: [] } },
    parameters: [],
    bodyProperties: [],
    responseProperties: [],
    testRefs: [],
    ...overrides,
  };
}

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-01-01T00:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.0.0',
    totalTestCount: 5,
    summary: {
      endpoints: { total: 0, covered: 0, percentage: 100 },
      statusCodes: { total: 0, covered: 0, percentage: 100 },
      parameters: { total: 0, covered: 0, percentage: 100 },
      bodyProperties: { total: 0, covered: 0, percentage: 100 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    },
    tagCoverage: {},
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
    acknowledgedHits: [],
    ...overrides,
  };
}

describe('mergeCoverageResults', () => {
  it('throws when fewer than 2 results are provided', () => {
    expect(() => mergeCoverageResults(makeResult())).toThrow(
      '[playswag] mergeCoverageResults requires at least 2 results'
    );
  });

  it('merges disjoint operations from two results', () => {
    const a = makeResult({
      operations: [makeOp({ path: '/users', method: 'GET', covered: true })],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [makeOp({ path: '/posts', method: 'POST', covered: true })],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);

    expect(merged.operations).toHaveLength(2);
    expect(merged.summary.endpoints.total).toBe(2);
    expect(merged.summary.endpoints.covered).toBe(2);
    expect(merged.summary.endpoints.percentage).toBe(100);
  });

  it('unions coverage flags for overlapping operations', () => {
    const op = makeOp({
      statusCodes: {
        '200': { covered: true, testRefs: ['test-a'] },
        '404': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'limit', in: 'query', required: false, covered: true },
        { name: 'offset', in: 'query', required: false, covered: false },
      ],
    });

    const a = makeResult({
      operations: [{ ...op, covered: true, testRefs: ['test-a'] }],
      uncoveredOperations: [],
    });

    const b = makeResult({
      operations: [
        makeOp({
          statusCodes: {
            '200': { covered: false, testRefs: [] },
            '404': { covered: true, testRefs: ['test-b'] },
          },
          parameters: [
            { name: 'limit', in: 'query', required: false, covered: false },
            { name: 'offset', in: 'query', required: false, covered: true },
          ],
          covered: true,
          testRefs: ['test-b'],
        }),
      ],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);

    expect(merged.operations).toHaveLength(1);
    const mergedOp = merged.operations[0];

    // Both status codes should be covered
    expect(mergedOp.statusCodes['200'].covered).toBe(true);
    expect(mergedOp.statusCodes['404'].covered).toBe(true);
    expect(mergedOp.statusCodes['200'].testRefs).toEqual(['test-a']);
    expect(mergedOp.statusCodes['404'].testRefs).toEqual(['test-b']);

    // Both params should be covered
    expect(mergedOp.parameters.find((p) => p.name === 'limit')!.covered).toBe(true);
    expect(mergedOp.parameters.find((p) => p.name === 'offset')!.covered).toBe(true);

    // testRefs should be unioned
    expect(mergedOp.testRefs).toEqual(expect.arrayContaining(['test-a', 'test-b']));
    expect(mergedOp.testRefs).toHaveLength(2);
  });

  it('promotes uncovered operations to covered when another result covers them', () => {
    const a = makeResult({
      operations: [],
      uncoveredOperations: [makeOp({ covered: false })],
    });
    const b = makeResult({
      operations: [makeOp({ covered: true, testRefs: ['test-b'] })],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);

    expect(merged.operations).toHaveLength(1);
    expect(merged.operations[0].covered).toBe(true);
    expect(merged.uncoveredOperations).toHaveLength(0);
  });

  it('recomputes summary from merged operations', () => {
    const a = makeResult({
      operations: [
        makeOp({
          path: '/users',
          method: 'GET',
          covered: true,
          statusCodes: { '200': { covered: true, testRefs: [] } },
          parameters: [{ name: 'q', in: 'query', required: false, covered: true }],
        }),
      ],
      uncoveredOperations: [
        makeOp({
          path: '/posts',
          method: 'GET',
          covered: false,
          statusCodes: { '200': { covered: false, testRefs: [] } },
        }),
      ],
    });

    const b = makeResult({
      operations: [
        makeOp({
          path: '/posts',
          method: 'GET',
          covered: true,
          statusCodes: { '200': { covered: true, testRefs: ['t1'] } },
        }),
      ],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);

    expect(merged.summary.endpoints.total).toBe(2);
    expect(merged.summary.endpoints.covered).toBe(2);
    expect(merged.summary.statusCodes.total).toBe(2);
    expect(merged.summary.statusCodes.covered).toBe(2);
    expect(merged.summary.parameters.total).toBe(1);
    expect(merged.summary.parameters.covered).toBe(1);
  });

  it('merges body properties by name', () => {
    const a = makeResult({
      operations: [
        makeOp({
          covered: true,
          bodyProperties: [
            { name: 'name', required: true, covered: true },
            { name: 'email', required: false, covered: false },
          ],
        }),
      ],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [
        makeOp({
          covered: true,
          bodyProperties: [
            { name: 'name', required: true, covered: false },
            { name: 'email', required: false, covered: true },
          ],
        }),
      ],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);
    const body = merged.operations[0].bodyProperties;

    expect(body.find((p) => p.name === 'name')!.covered).toBe(true);
    expect(body.find((p) => p.name === 'email')!.covered).toBe(true);
  });

  it('merges response properties by statusCode + name', () => {
    const a = makeResult({
      operations: [
        makeOp({
          covered: true,
          responseProperties: [
            { statusCode: '200', name: 'id', required: true, covered: true },
            { statusCode: '200', name: 'name', required: true, covered: false },
          ],
        }),
      ],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [
        makeOp({
          covered: true,
          responseProperties: [
            { statusCode: '200', name: 'id', required: true, covered: false },
            { statusCode: '200', name: 'name', required: true, covered: true },
          ],
        }),
      ],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);
    const resp = merged.operations[0].responseProperties;

    expect(resp.find((p) => p.name === 'id')!.covered).toBe(true);
    expect(resp.find((p) => p.name === 'name')!.covered).toBe(true);
  });

  it('sums totalTestCount across results', () => {
    const a = makeResult({ totalTestCount: 10 });
    const b = makeResult({ totalTestCount: 15 });

    const merged = mergeCoverageResults(a, b);
    expect(merged.totalTestCount).toBe(25);
  });

  it('unions specFiles and deduplicates', () => {
    const a = makeResult({ specFiles: ['./api.yaml', './shared.yaml'] });
    const b = makeResult({ specFiles: ['./shared.yaml', './admin.yaml'] });

    const merged = mergeCoverageResults(a, b);
    expect(merged.specFiles).toEqual(['./api.yaml', './shared.yaml', './admin.yaml']);
  });

  it('deduplicates unmatched hits', () => {
    const hit = {
      method: 'GET',
      url: 'https://unknown.com/foo',
      statusCode: 200,
      testFile: 'test.ts',
      testTitle: 'my test',
    };
    const a = makeResult({ unmatchedHits: [hit] });
    const b = makeResult({ unmatchedHits: [hit] });

    const merged = mergeCoverageResults(a, b);
    expect(merged.unmatchedHits).toHaveLength(1);
  });

  it('sums acknowledged hit counts per pattern', () => {
    const a = makeResult({
      acknowledgedHits: [{ label: 'Auth', pattern: 'https://auth/**', count: 3 }],
    });
    const b = makeResult({
      acknowledgedHits: [{ label: 'Auth', pattern: 'https://auth/**', count: 5 }],
    });

    const merged = mergeCoverageResults(a, b);
    expect(merged.acknowledgedHits).toHaveLength(1);
    expect(merged.acknowledgedHits[0].count).toBe(8);
  });

  it('computes tag coverage from merged operations', () => {
    const a = makeResult({
      operations: [
        makeOp({
          path: '/users',
          method: 'GET',
          tags: ['users'],
          covered: true,
          statusCodes: { '200': { covered: true, testRefs: [] } },
        }),
      ],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [
        makeOp({
          path: '/users',
          method: 'POST',
          tags: ['users'],
          covered: false,
          statusCodes: { '201': { covered: false, testRefs: [] } },
        }),
      ],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);
    expect(merged.tagCoverage['users']).toBeDefined();
    expect(merged.tagCoverage['users'].endpoints.total).toBe(2);
    expect(merged.tagCoverage['users'].endpoints.covered).toBe(1);
  });

  it('merges three or more results', () => {
    const a = makeResult({
      operations: [makeOp({ path: '/a', method: 'GET', covered: true })],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [makeOp({ path: '/b', method: 'GET', covered: true })],
      uncoveredOperations: [],
    });
    const c = makeResult({
      operations: [makeOp({ path: '/c', method: 'GET', covered: true })],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b, c);
    expect(merged.operations).toHaveLength(3);
    expect(merged.summary.endpoints.covered).toBe(3);
  });

  it('does not mutate input results', () => {
    const op = makeOp({
      covered: false,
      statusCodes: { '200': { covered: false, testRefs: [] } },
    });
    const a = makeResult({ operations: [op], uncoveredOperations: [] });
    const b = makeResult({
      operations: [makeOp({ covered: true, statusCodes: { '200': { covered: true, testRefs: ['t1'] } } })],
      uncoveredOperations: [],
    });

    mergeCoverageResults(a, b);

    // Original should remain uncovered
    expect(a.operations[0].covered).toBe(false);
    expect(a.operations[0].statusCodes['200'].covered).toBe(false);
  });

  it('handles 100% percentage when total is 0', () => {
    const a = makeResult({
      operations: [makeOp({ covered: true, statusCodes: {}, parameters: [] })],
      uncoveredOperations: [],
    });
    const b = makeResult({
      operations: [makeOp({ path: '/other', method: 'GET', covered: true, statusCodes: {}, parameters: [] })],
      uncoveredOperations: [],
    });

    const merged = mergeCoverageResults(a, b);
    // 0 total status codes → 100%
    expect(merged.summary.statusCodes.percentage).toBe(100);
    expect(merged.summary.parameters.percentage).toBe(100);
  });
});
