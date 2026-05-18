import { describe, it, expect } from 'vitest';
import { parseSpecs } from '../../src/openapi/parser.js';

describe('parseOne cache', () => {
  it('retries after a failed parse (cache entry is cleared)', async () => {
    const missing = './definitely-not-a-spec-file-12345.yaml';
    await expect(parseSpecs(missing)).rejects.toThrow();
    await expect(parseSpecs(missing)).rejects.toThrow();
  });
});
