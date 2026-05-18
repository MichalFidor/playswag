import { describe, it, expect } from 'vitest';
import {
  assertRemoteSpecHostsRequired,
  assertSpecUrlAllowed,
} from '../../src/utils/spec-security.js';

describe('assertSpecUrlAllowed', () => {
  it('requires allowedSpecHosts for any HTTP fetch', async () => {
    await expect(
      assertSpecUrlAllowed('https://api.example.com/openapi.json')
    ).rejects.toThrow(/allowedSpecHosts/);
  });

  it('blocks localhost by default', async () => {
    await expect(
      assertSpecUrlAllowed('http://localhost:8080/openapi.json', {
        allowedSpecHosts: ['localhost'],
      })
    ).rejects.toThrow(/blocked/);
  });

  it('allows localhost when allowPrivateHosts is true', async () => {
    await expect(
      assertSpecUrlAllowed('http://127.0.0.1:8080/openapi.json', {
        allowPrivateHosts: true,
        allowedSpecHosts: ['127.0.0.1'],
      })
    ).resolves.toBeUndefined();
  });

  it('enforces allowedSpecHosts allowlist', async () => {
    await expect(
      assertSpecUrlAllowed('https://api.example.com/openapi.json', {
        allowedSpecHosts: ['other.example.com'],
      })
    ).rejects.toThrow(/not in allowedSpecHosts/);
  });

  it('allows host on allowlist', async () => {
    await expect(
      assertSpecUrlAllowed('https://api.example.com/openapi.json', {
        allowedSpecHosts: ['api.example.com'],
      })
    ).resolves.toBeUndefined();
  });

  it('blocks non-http protocols', async () => {
    await expect(assertSpecUrlAllowed('file:///etc/passwd')).rejects.toThrow(/protocol/);
  });
});

describe('assertRemoteSpecHostsRequired', () => {
  it('requires allowlist for remote spec URLs', () => {
    expect(() =>
      assertRemoteSpecHostsRequired('https://api.example.com/openapi.json')
    ).toThrow(/allowedSpecHosts/);
  });

  it('passes when allowlist is set', () => {
    expect(() =>
      assertRemoteSpecHostsRequired('https://api.example.com/openapi.json', {
        allowedSpecHosts: ['api.example.com'],
      })
    ).not.toThrow();
  });

  it('does not require allowlist for local paths', () => {
    expect(() => assertRemoteSpecHostsRequired('./openapi.yaml')).not.toThrow();
  });
});
