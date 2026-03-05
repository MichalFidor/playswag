import { describe, it, expect } from 'vitest';
import { analyzeResponseProperties } from '../../src/coverage/schema-analyzer.js';
import type { NormalizedOperation } from '../../src/types.js';

const opWithSchema: NormalizedOperation = {
  pathTemplate: '/api/users/{id}',
  method: 'GET',
  parameters: [],
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
        properties: {
          code:    { type: 'string' },
          message: { type: 'string' },
        },
        required: ['message'],
      },
    },
    '204': {}, // no schema
  },
};

const opNoSchema: NormalizedOperation = {
  pathTemplate: '/api/health',
  method: 'GET',
  parameters: [],
  responses: {
    '200': {}, // no schema
  },
};

describe('analyzeResponseProperties', () => {
  describe('when the response code has a schema', () => {
    it('returns one entry per top-level property', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', { id: '1', name: 'Alice', email: 'a@b.com' });
      expect(result).toHaveLength(3);
    });

    it('marks properties as covered when present in the response body', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', { id: '1', name: 'Alice', email: 'a@b.com' });
      expect(result.find((r) => r.name === 'id')?.covered).toBe(true);
      expect(result.find((r) => r.name === 'name')?.covered).toBe(true);
      expect(result.find((r) => r.name === 'email')?.covered).toBe(true);
    });

    it('marks properties as not covered when absent from the response body', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', { id: '1' }); // name and email missing
      expect(result.find((r) => r.name === 'id')?.covered).toBe(true);
      expect(result.find((r) => r.name === 'name')?.covered).toBe(false);
      expect(result.find((r) => r.name === 'email')?.covered).toBe(false);
    });

    it('marks required flag correctly', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', undefined);
      expect(result.find((r) => r.name === 'id')?.required).toBe(true);
      expect(result.find((r) => r.name === 'name')?.required).toBe(true);
      expect(result.find((r) => r.name === 'email')?.required).toBe(false);
    });

    it('sets statusCode on each result entry', () => {
      const result = analyzeResponseProperties(opWithSchema, '404', { message: 'Not found' });
      expect(result.every((r) => r.statusCode === '404')).toBe(true);
    });

    it('returns all uncovered when responseBody is undefined', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', undefined);
      expect(result.every((r) => !r.covered)).toBe(true);
    });

    it('returns all uncovered when responseBody is null', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', null);
      expect(result.every((r) => !r.covered)).toBe(true);
    });

    it('returns all uncovered when responseBody is an array (not an object)', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', [{ id: '1', name: 'Alice' }]);
      expect(result.every((r) => !r.covered)).toBe(true);
    });

    it('returns empty array for a response code with no schema on the operation', () => {
      const result = analyzeResponseProperties(opWithSchema, '204', { anything: true });
      expect(result).toHaveLength(0);
    });

    it('returns empty array for an unknown response code', () => {
      const result = analyzeResponseProperties(opWithSchema, '500', { error: 'oops' });
      expect(result).toHaveLength(0);
    });
  });

  describe('when the operation response has no schema', () => {
    it('returns empty array', () => {
      const result = analyzeResponseProperties(opNoSchema, '200', { status: 'ok' });
      expect(result).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when response schema has no properties', () => {
      const opEmptySchema: NormalizedOperation = {
        pathTemplate: '/api/ping',
        method: 'GET',
        parameters: [],
        responses: {
          '200': { schema: { type: 'object' } },
        },
      };
      const result = analyzeResponseProperties(opEmptySchema, '200', { anything: true });
      expect(result).toHaveLength(0);
    });

    it('returns all uncovered when responseBody is a JSON primitive number string', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', '42');
      expect(result.every((r) => !r.covered)).toBe(true);
    });

    it('returns all uncovered when responseBody is a JSON primitive boolean string', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', 'true');
      expect(result.every((r) => !r.covered)).toBe(true);
    });

    it('returns all uncovered when responseBody is a JSON quoted string', () => {
      const result = analyzeResponseProperties(opWithSchema, '200', '"hello"');
      expect(result.every((r) => !r.covered)).toBe(true);
    });
  });
});
