import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import {
  assertRemoteSpecHostsRequired,
  assertSpecUrlAllowed,
  resolveSpecUrl,
} from '../../src/utils/spec-security.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const lookupAll = vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>);

beforeEach(() => {
  lookupAll.mockReset();
  lookupAll.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
});

describe('assertSpecUrlAllowed', () => {
  it('requires allowedSpecHosts for any HTTP fetch', async () => {
    await expect(assertSpecUrlAllowed('https://api.example.com/openapi.json')).rejects.toThrow(/allowedSpecHosts/);
  });

  it.each([
    'localhost', 'localhost.', 'metadata.google.internal.',
    '127.0.0.1', '2130706433', '0x7f000001', '10.0.0.1', '172.16.0.1', '192.168.0.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '198.19.1.1', '224.0.0.1', '255.255.255.255',
    '[::]', '[::1]', '[0:0:0:0:0:0:0:1]', '[::ffff:127.0.0.1]', '[::ffff:192.168.1.1]',
    '[::ffff:a9fe:a9fe]', '[fc00::1]', '[fd12::1]', '[fe80::1]', '[febf::1]', '[fec0::1]',
    '[ff02::1]', '[64:ff9b::7f00:1]', '[2002:7f00:1::]',
  ])('blocks private/reserved or disguised host %s before DNS', async (host) => {
    const url = `http://${host}/openapi.json`;
    await expect(assertSpecUrlAllowed(url, { allowedSpecHosts: [new URL(url).hostname] })).rejects.toThrow(/blocked/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('allows localhost only with an explicit private host opt-in and allowlist', async () => {
    await expect(assertSpecUrlAllowed('http://127.0.0.1:8080/openapi.json', {
      allowPrivateHosts: true, allowedSpecHosts: ['127.0.0.1'],
    })).resolves.toBeUndefined();
  });

  it('enforces allowedSpecHosts before performing DNS', async () => {
    await expect(assertSpecUrlAllowed('https://api.example.com/openapi.json', {
      allowedSpecHosts: ['other.example.com'],
    })).rejects.toThrow(/not in allowedSpecHosts/);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('accepts only label-boundary wildcard hosts and normalizes trailing dots', async () => {
    await expect(assertSpecUrlAllowed('https://api.example.com./openapi.json', {
      allowedSpecHosts: ['*.EXAMPLE.com'],
    })).resolves.toBeUndefined();
    await expect(assertSpecUrlAllowed('https://notexample.com/openapi.json', {
      allowedSpecHosts: ['*.example.com'],
    })).rejects.toThrow(/not in allowedSpecHosts/);
  });

  it.each(['93.184.216.34', '[2606:4700:4700::1111]', '[::ffff:93.184.216.34]'])('allows public literal %s', async (host) => {
    await expect(assertSpecUrlAllowed(`https://${host}/spec.json`, {
      allowedSpecHosts: [new URL(`https://${host}`).hostname],
    })).resolves.toBeUndefined();
  });

  it('validates every DNS answer, including mixed public/private answers', async () => {
    lookupAll.mockResolvedValue([
      { address: '93.184.216.34', family: 4 }, { address: '::ffff:127.0.0.1', family: 6 },
    ]);
    await expect(assertSpecUrlAllowed('https://api.example.com/spec.json', {
      allowedSpecHosts: ['api.example.com'],
    })).rejects.toThrow(/resolves to private/);
  });

  it('fails closed when DNS returns ENOTFOUND', async () => {
    lookupAll.mockRejectedValue(Object.assign(new Error('DNS not found'), { code: 'ENOTFOUND' }));
    await expect(assertSpecUrlAllowed('https://api.example.com/spec.json', {
      allowedSpecHosts: ['api.example.com'],
    })).rejects.toThrow(/DNS not found/);
  });

  it('fails closed on empty or invalid DNS answers', async () => {
    lookupAll.mockResolvedValueOnce([]).mockResolvedValueOnce([{ address: '127.0.0.1', family: 6 }]);
    const options = { allowedSpecHosts: ['api.example.com'] };
    await expect(resolveSpecUrl('https://api.example.com/spec.json', options)).rejects.toThrow(/did not resolve/);
    await expect(resolveSpecUrl('https://api.example.com/spec.json', options)).rejects.toThrow(/invalid IP/);
  });

  it('blocks non-http protocols', async () => {
    await expect(assertSpecUrlAllowed('file:///synthetic-spec.json')).rejects.toThrow(/protocol/);
  });
});

describe('assertRemoteSpecHostsRequired', () => {
  it('requires allowlist for remote spec URLs', () => {
    expect(() => assertRemoteSpecHostsRequired('https://api.example.com/openapi.json')).toThrow(/allowedSpecHosts/);
  });
  it('passes when allowlist is set', () => {
    expect(() => assertRemoteSpecHostsRequired('https://api.example.com/openapi.json', {
      allowedSpecHosts: ['api.example.com'],
    })).not.toThrow();
  });
  it('does not require allowlist for local paths', () => {
    expect(() => assertRemoteSpecHostsRequired('./openapi.yaml')).not.toThrow();
  });
});
