import { describe, it, expect, afterEach } from 'vitest';
import { isPlayswagDisabled } from '../../src/utils/env.js';

describe('isPlayswagDisabled', () => {
  const original = process.env['PLAYSWAG_DISABLED'];

  afterEach(() => {
    if (original === undefined) delete process.env['PLAYSWAG_DISABLED'];
    else process.env['PLAYSWAG_DISABLED'] = original;
  });

  it('returns false when unset', () => {
    delete process.env['PLAYSWAG_DISABLED'];
    expect(isPlayswagDisabled()).toBe(false);
  });

  it('returns true for common truthy values', () => {
    for (const value of ['1', 'true', 'TRUE', 'yes', 'on']) {
      process.env['PLAYSWAG_DISABLED'] = value;
      expect(isPlayswagDisabled()).toBe(true);
    }
  });

  it('returns false for empty or other values', () => {
    process.env['PLAYSWAG_DISABLED'] = '';
    expect(isPlayswagDisabled()).toBe(false);
    process.env['PLAYSWAG_DISABLED'] = '0';
    expect(isPlayswagDisabled()).toBe(false);
  });
});
