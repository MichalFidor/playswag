import { afterEach, describe, expect, it, vi } from 'vitest';
import { validatePlayswagConfig } from '../../src/config/validate.js';
import { log } from '../../src/log.js';

describe('validatePlayswagConfig — excludeStatusCodes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts codes, ranges and default', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    validatePlayswagConfig({ specs: './openapi.yaml', excludeStatusCodes: [500, '204', '4xx', 'default'] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns about entries that are not response keys', () => {
    const warn = vi.spyOn(log, 'warn').mockImplementation(() => {});
    validatePlayswagConfig({ specs: './openapi.yaml', excludeStatusCodes: [600, 'server-error'] });
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toContain('"600"');
  });
});
