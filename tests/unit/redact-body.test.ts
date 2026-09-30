import { describe, it, expect } from 'vitest';
import { redactSensitiveFields, redactRequestBody, redactUrl } from '../../src/utils/redact-body.js';

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

describe('serialized and cyclic body redaction', () => {
  it.each([
    JSON.stringify({ user: 'alice', password: 'body-secret' }),
    Buffer.from(JSON.stringify({ user: 'alice', password: 'body-secret' })),
  ])('redacts serialized JSON and retains properties', (body) => {
    expect(redactRequestBody(body)).toEqual({ user: 'alice', password: '[REDACTED]' });
  });

  it('hides opaque bodies and form values, including JSON scalars', () => {
    expect(redactRequestBody('opaque-secret')).toBe('[REDACTED]');
    expect(redactRequestBody('"opaque-secret"')).toBe('[REDACTED]');
    expect(redactRequestBody(Buffer.from('opaque-secret'))).toBe('[REDACTED]');
    expect(redactRequestBody('user=alice&password=form-secret')).toEqual({ user: '[REDACTED]', password: '[REDACTED]' });
  });

  it('preserves the shape under sensitive objects and does not mutate input', () => {
    const body = { credentials: { user: 'alice', password: 'secret' } };
    expect(redactSensitiveFields(body)).toEqual({ credentials: { user: '[REDACTED]', password: '[REDACTED]' } });
    expect(body.credentials.password).toBe('secret');
  });

  it('bounds cyclic, deeply nested and binary structures without leaking bytes', () => {
    const body: Record<string, unknown> = { password: 'secret', binary: Buffer.from('binary-secret') };
    body.self = body;
    expect(redactSensitiveFields(body)).toEqual({ password: '[REDACTED]', binary: '[Binary]', self: '[Circular]' });
    let nested: unknown = { password: 'deep-secret' };
    for (let i = 0; i < 1000; i++) nested = { child: nested };
    expect(JSON.stringify(redactSensitiveFields(nested))).not.toContain('deep-secret');
    expect(redactRequestBody('x'.repeat(256 * 1024 + 1))).toBe('[Truncated]');
  });

  it('removes URL userinfo, fragment and query values while retaining query names', () => {
    const output = redactUrl('https://user:pass@example.com/users?access_token=query-secret&limit=5#fragment-secret');
    const url = new URL(output);
    expect(url.username).toBe('');
    expect(url.password).toBe('');
    expect(url.hash).toBe('');
    expect([...url.searchParams]).toEqual([['access_token', '[REDACTED]'], ['limit', '[REDACTED]']]);
    expect(url.pathname).toBe('/users');
  });
});
