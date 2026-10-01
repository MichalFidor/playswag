import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { createServer, type Server, type RequestListener } from 'node:http';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';
import { once } from 'node:events';
import { gzipSync } from 'node:zlib';
import { fetchSpecContent } from '../../src/utils/spec-fetch.js';
import { createBudgetedSpecReader } from '../../src/openapi/spec-resource-budget.js';

vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }));
const lookupAll = vi.mocked(lookup as (hostname: string, options: { all: true }) => Promise<LookupAddress[]>);

const servers: Server[] = [];
async function serve(handler: RequestListener): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing server port');
  return `http://127.0.0.1:${address.port}`;
}
const localOptions = { allowedSpecHosts: ['127.0.0.1', 'spec.test'], allowPrivateHosts: true };

beforeEach(() => { lookupAll.mockReset(); });
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

describe('fetchSpecContent', () => {
  it('returns a streamed body and preserves Host while pinning the DNS result', async () => {
    let host: string | undefined;
    const base = await serve((req, res) => { host = req.headers.host; res.end('{"openapi":"3.0.0"}'); });
    lookupAll
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockResolvedValueOnce([{ address: '127.0.0.2', family: 4 }]);
    const url = base.replace('127.0.0.1', 'spec.test');
    const body = await fetchSpecContent(`${url}/spec.json`, localOptions);
    expect(body.toString()).toContain('openapi');
    expect(host).toBe(new URL(url).host);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('rejects private DNS results before starting an HTTP request', async () => {
    let requests = 0;
    const base = await serve((_req, res) => { requests++; res.end('{}'); });
    lookupAll.mockResolvedValue([{ address: '127.0.0.1', family: 4 }]);
    await expect(fetchSpecContent(base.replace('127.0.0.1', 'spec.test'), {
      allowedSpecHosts: ['spec.test'],
    })).rejects.toThrow(/private/);
    expect(requests).toBe(0);
  });

  it('revalidates DNS on every redirect before connecting to the new hop', async () => {
    const base = await serve((_req, res) => { res.writeHead(302, { location: 'http://other.test/spec.json' }); res.end(); });
    lookupAll.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    await expect(fetchSpecContent(base.replace('127.0.0.1', 'spec.test'), localOptions)).rejects.toThrow(/not in allowedSpecHosts/);
    expect(lookup).toHaveBeenCalledTimes(1);
  });

  it('fails closed when DNS changes to an unresolved name on a same-host redirect', async () => {
    let requests = 0;
    const base = await serve((_req, res) => {
      requests++;
      res.writeHead(302, { location: '/next.json' }); res.end();
    });
    lookupAll
      .mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }])
      .mockRejectedValueOnce(Object.assign(new Error('DNS rebinding lookup failed'), { code: 'ENOTFOUND' }));
    await expect(fetchSpecContent(base.replace('127.0.0.1', 'spec.test'), localOptions)).rejects.toThrow(/DNS rebinding lookup failed/);
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(requests).toBe(1);
  });

  it('rejects a redirect to a file and closes an unfinished redirect response', async () => {
    let closed!: () => void;
    const connectionClosed = new Promise<void>((resolve) => { closed = resolve; });
    const base = await serve((_req, res) => {
      res.on('close', closed);
      res.writeHead(302, { location: 'file:///synthetic-spec.json' });
      res.flushHeaders();
    });
    await expect(fetchSpecContent(base, localOptions)).rejects.toThrow(/protocol/);
    await connectionClosed;
  });

  it('detects loops and enforces the redirect count', async () => {
    const base = await serve((req, res) => {
      res.writeHead(302, { location: req.url === '/loop' ? '/loop' : `/hop${Number(req.url?.slice(4) ?? 0) + 1}` });
      res.end();
    });
    await expect(fetchSpecContent(`${base}/loop`, localOptions)).rejects.toThrow(/loop/);
    await expect(fetchSpecContent(`${base}/hop0`, { ...localOptions, maxRedirects: 1 })).rejects.toThrow(/Too many redirects/);
  });

  it('rejects malformed redirects without an uncaught exception', async () => {
    const base = await serve((_req, res) => { res.writeHead(302, { location: 'http://[' }); res.end(); });
    await expect(fetchSpecContent(base, localOptions)).rejects.toThrow(/Invalid URL/);
  });

  it('enforces the byte bound while chunked data is still arriving', async () => {
    let closed!: () => void;
    const connectionClosed = new Promise<void>((resolve) => { closed = resolve; });
    const base = await serve((_req, res) => {
      res.on('close', closed);
      res.write('x'.repeat(65));
      // Intentionally keep the response open: waiting for the whole body would hang.
    });
    await expect(fetchSpecContent(base, { ...localOptions, maxBytes: 64, timeoutMs: 1000 })).rejects.toThrow(/maxSpecBytes/);
    await connectionClosed;
  });

  it('rejects an oversized Content-Length before consuming the body', async () => {
    const base = await serve((_req, res) => { res.writeHead(200, { 'Content-Length': '1000' }); res.flushHeaders(); });
    await expect(fetchSpecContent(base, { ...localOptions, maxBytes: 64 })).rejects.toThrow(/maxSpecBytes/);
  });

  it('times out a body that stalls after its headers', async () => {
    const base = await serve((_req, res) => { res.writeHead(200); res.flushHeaders(); });
    await expect(fetchSpecContent(base, { ...localOptions, timeoutMs: 50 })).rejects.toThrow(/timed out/);
  });

  it('times out unresolved DNS without initiating a connection after the deadline', async () => {
    let resolveDns!: (records: Array<{ address: string; family: number }>) => void;
    lookupAll.mockImplementation(() => new Promise((resolve) => { resolveDns = resolve; }));
    let requests = 0;
    const base = await serve((_req, res) => { requests++; res.end('{}'); });
    await expect(fetchSpecContent(base.replace('127.0.0.1', 'spec.test'), {
      ...localOptions, timeoutMs: 30,
    })).rejects.toThrow(/timed out/);
    resolveDns([{ address: '127.0.0.1', family: 4 }]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(requests).toBe(0);
  });

  it('uses one deadline across redirects', async () => {
    const base = await serve((req, res) => {
      const timer = setTimeout(() => {
        res.writeHead(302, { location: `/hop${Number(req.url?.slice(4) ?? 0) + 1}` }); res.end();
      }, 40);
      res.on('close', () => clearTimeout(timer));
    });
    await expect(fetchSpecContent(`${base}/hop0`, { ...localOptions, timeoutMs: 70 })).rejects.toThrow(/timed out/);
  });

  it('handles compressed responses and bounds their decompressed bytes', async () => {
    const base = await serve((req, res) => {
      res.writeHead(200, { 'Content-Encoding': 'gzip' });
      res.end(gzipSync(req.url === '/small' ? '{"openapi":"3.0.0"}' : 'x'.repeat(10_000)));
    });
    const body = await fetchSpecContent(`${base}/small`, { ...localOptions, maxBytes: 100 });
    expect(body.toString()).toContain('openapi');
    await expect(fetchSpecContent(`${base}/large`, { ...localOptions, maxBytes: 100 })).rejects.toThrow(/maxSpecBytes/);
  });

  it('cancels active HTTP bodies and queued references when the parse-wide byte budget is exhausted', async () => {
    let requests = 0;
    let closed!: () => void;
    const connectionClosed = new Promise<void>((resolve) => { closed = resolve; });
    const base = await serve((_req, res) => {
      requests++;
      res.on('close', closed);
      res.write('abcdef');
    });
    const read = createBudgetedSpecReader((url, hooks) => fetchSpecContent(url, { ...localOptions, ...hooks }), {
      maxDocuments: 10, maxDecodedBytes: 5, concurrency: 1,
    });
    const results = await Promise.allSettled([read(`${base}/first`), read(`${base}/queued`)]);
    expect(results.every((result) => result.status === 'rejected' && /aggregate decoded byte limit/.test(String(result.reason)))).toBe(true);
    await connectionClosed;
    expect(requests).toBe(1);
  });

  it('rejects invalid limits rather than disabling protections', async () => {
    await expect(fetchSpecContent('http://127.0.0.1', { ...localOptions, timeoutMs: Infinity })).rejects.toThrow(/specFetchTimeoutMs/);
    await expect(fetchSpecContent('http://127.0.0.1', { ...localOptions, maxBytes: NaN })).rejects.toThrow(/maxSpecBytes/);
  });
});
