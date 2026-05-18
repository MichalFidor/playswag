import { describe, it, expect } from 'vitest';
import { makeSummaryItem, computeSummaryFromOperations } from '../../src/coverage/summary.js';
import type { OperationCoverage } from '../../src/types.js';

describe('makeSummaryItem', () => {
  it('rounds to one decimal place', () => {
    expect(makeSummaryItem(3, 1).percentage).toBe(33.3);
  });

  it('returns 100% when total is zero', () => {
    expect(makeSummaryItem(0, 0).percentage).toBe(100);
  });
});

describe('computeSummaryFromOperations', () => {
  it('aggregates endpoint coverage', () => {
    const ops: OperationCoverage[] = [
      {
        path: '/a',
        method: 'GET',
        covered: true,
        statusCodes: {},
        parameters: [],
        bodyProperties: [],
        responseProperties: [],
        testRefs: [],
      },
      {
        path: '/b',
        method: 'GET',
        covered: false,
        statusCodes: {},
        parameters: [],
        bodyProperties: [],
        responseProperties: [],
        testRefs: [],
      },
    ];
    const summary = computeSummaryFromOperations(ops);
    expect(summary.endpoints).toEqual({ total: 2, covered: 1, percentage: 50 });
  });
});
