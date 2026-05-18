import { describe, it, expect } from 'vitest';
import { redactSensitiveFields } from '../../src/utils/redact-body.js';

describe('redactSensitiveFields', () => {
  it('redacts known sensitive keys recursively', () => {
    const input = {
      user: 'alice',
      password: 'hunter2',
      profile: { access_token: 'abc', name: 'Alice' },
    };
    expect(redactSensitiveFields(input)).toEqual({
      user: 'alice',
      password: '[REDACTED]',
      profile: { access_token: '[REDACTED]', name: 'Alice' },
    });
  });

  it('redacts keys containing token substring', () => {
    expect(redactSensitiveFields({ myTokenValue: 'x' })).toEqual({
      myTokenValue: '[REDACTED]',
    });
  });

  it('leaves primitives unchanged', () => {
    expect(redactSensitiveFields('plain')).toBe('plain');
  });
});
