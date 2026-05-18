import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchSpecContent } from '../../src/utils/spec-fetch.js';

describe('fetchSpecContent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('validates redirect targets against SSRF rules', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce({
          status: 302,
          ok: false,
          headers: { get: (h: string) => (h === 'location' ? 'http://127.0.0.1/evil.json' : null) },
        })
    );

    await expect(
      fetchSpecContent('https://api.example.com/openapi.json', {
        allowedSpecHosts: ['api.example.com'],
      })
    ).rejects.toThrow(/blocked|private/);
  });

  it('returns body when fetch succeeds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        headers: { get: () => null },
        arrayBuffer: async () => new TextEncoder().encode('{"openapi":"3.0.0"}').buffer,
      })
    );

    const buf = await fetchSpecContent('https://api.example.com/openapi.json', {
      allowedSpecHosts: ['api.example.com'],
    });
    expect(buf.toString('utf8')).toContain('openapi');
  });
});
