import { describe, it, expect, vi } from 'vitest';
import type { TestInfo } from '@playwright/test';
import {
  buildTrackedRequest,
  redactHeaders,
  DEFAULT_MAX_RESPONSE_BODY_BYTES,
} from '../../src/fixture.js';

interface MockAPIResponse {
  url(): string;
  status(): number;
  headers(): Record<string, string>;
  body(): Promise<Buffer>;
}

interface MockAPIRequestContext {
  get(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  post(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  put(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  patch(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  delete(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  head(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  fetch(url: string, options?: Record<string, unknown>): Promise<MockAPIResponse>;
  dispose(): Promise<void>;
}

interface EndpointHit {
  method: string;
  url: string;
  statusCode: number;
  requestBody?: unknown;
  responseBody?: unknown;
  queryParams?: Record<string, string>;
  headers?: Record<string, string>;
  testFile: string;
  testTitle: string;
}

function makeResponse(overrides: Partial<{ url: string; status: number; body: unknown; contentType: string }> = {}): MockAPIResponse {
  const {
    url = 'http://localhost:3456/api/users',
    status = 200,
    body = { id: '1' },
    contentType = 'application/json',
  } = overrides;
  return {
    url: () => url,
    status: () => status,
    headers: () => ({ 'content-type': contentType }),
    body: () => Promise.resolve(Buffer.from(JSON.stringify(body))),
  };
}

function makeMockContext(response?: MockAPIResponse): MockAPIRequestContext {
  const resp = response ?? makeResponse();
  return {
    get: vi.fn().mockResolvedValue(resp),
    post: vi.fn().mockResolvedValue(resp),
    put: vi.fn().mockResolvedValue(resp),
    patch: vi.fn().mockResolvedValue(resp),
    delete: vi.fn().mockResolvedValue(resp),
    head: vi.fn().mockResolvedValue(resp),
    fetch: vi.fn().mockResolvedValue(resp),
    dispose: vi.fn().mockResolvedValue(undefined),
  };
}

const testInfo = { titlePath: ['test.spec.ts'], title: 'my test' } as TestInfo;

describe('redactHeaders', () => {
  it('redacts sensitive header names', () => {
    const out = redactHeaders(
      { Authorization: 'Bearer x', 'X-Trace-Id': 'abc' },
      ['authorization']
    );
    expect(out['Authorization']).toBe('[REDACTED]');
    expect(out['X-Trace-Id']).toBe('abc');
  });
});

describe('buildTrackedRequest (fixture proxy)', () => {
  it('intercepts GET and records a hit', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.method).toBe('GET');
    expect(hits[0]?.url).toBe('http://localhost:3456/api/users');
    expect(hits[0]?.statusCode).toBe(200);
  });

  it('intercepts POST and records a hit', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.post('http://localhost:3456/api/users', { data: { name: 'Alice' } });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.method).toBe('POST');
  });

  it('records requestBody from data option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.post('/api/users', { data: { name: 'Bob', email: 'b@b.com' } });
    expect(hits[0]?.requestBody).toEqual({ name: 'Bob', email: 'b@b.com' });
  });

  it('records requestBody from form option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.post('/api/users', { form: { name: 'FormUser' } });
    expect(hits[0]?.requestBody).toEqual({ name: 'FormUser' });
  });

  it('records query params when provided', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('/api/users', { params: { limit: 10, offset: 0 } });
    expect(hits[0]?.queryParams).toEqual({ limit: '10', offset: '0' });
  });

  it('extracts query params from URL string when no params option provided', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ url: 'http://localhost:3456/api/users?limit=5&page=2' });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users?limit=5&page=2');
    expect(hits[0]?.queryParams).toEqual({ limit: '5', page: '2' });
  });

  it('merges URL query params with params option; params option wins on conflict', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ url: 'http://localhost:3456/api/users?limit=5&page=2' });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users?page=2', { params: { limit: 10 } });
    expect(hits[0]?.queryParams).toEqual({ limit: '10', page: '2' });
  });

  it('redacts authorization headers by default', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('/api/users', {
      headers: { Authorization: 'Bearer secret', 'X-Trace-Id': 'abc123' },
    });
    expect(hits[0]?.headers?.['X-Trace-Id']).toBe('abc123');
    expect(hits[0]?.headers?.['Authorization']).toBe('[REDACTED]');
  });

  it('redacts sensitive JSON fields in request and response bodies by default', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ body: { access_token: 'secret', name: 'Alice' } });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.post('/api/login', { data: { password: 'hunter2', user: 'alice' } });
    expect(hits[0]?.requestBody).toEqual({ password: '[REDACTED]', user: 'alice' });
    expect(hits[0]?.responseBody).toEqual({ access_token: '[REDACTED]', name: 'Alice' });
  });

  it('captures response body by default', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ body: { status: 'ok' } });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('/api/health');
    expect(hits[0]?.responseBody).toEqual({ status: 'ok' });
  });

  it('skips response body capture when captureResponseBody is false', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo, { captureResponseBody: false });
    await tracked.get('/api/users');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('skips oversized response bodies', async () => {
    const hits: EndpointHit[] = [];
    const huge = { data: 'x'.repeat(DEFAULT_MAX_RESPONSE_BODY_BYTES + 1) };
    const resp = makeResponse({ body: huge });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo, { maxResponseBodyBytes: 1024 });
    await tracked.get('/api/big');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('sets testFile and testTitle from testInfo', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const info = { titlePath: ['my-file.spec.ts'], title: 'gets users' } as TestInfo;
    const tracked = buildTrackedRequest(ctx as never, hits, info);
    await tracked.get('/api/users');
    expect(hits[0]?.testFile).toBe('my-file.spec.ts');
    expect(hits[0]?.testTitle).toBe('gets users');
  });

  it('uses GET as default method for fetch without method option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.fetch('/api/health');
    expect(hits[0]?.method).toBe('GET');
  });

  it('uses provided method option for fetch', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.fetch('/api/users', { method: 'POST', data: { name: 'Alice' } });
    expect(hits[0]?.method).toBe('POST');
  });

  it('passes through non-intercepted methods without recording', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.dispose();
    expect(hits).toHaveLength(0);
    expect(ctx.dispose).toHaveBeenCalled();
  });

  it('intercepts all HTTP methods', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('/a');
    await tracked.post('/b');
    await tracked.put('/c');
    await tracked.patch('/d');
    await tracked.delete('/e');
    await tracked.head('/f');
    expect(hits).toHaveLength(6);
    expect(hits.map((h) => h.method)).toEqual(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD']);
  });

  it('handles non-JSON response body gracefully', async () => {
    const hits: EndpointHit[] = [];
    const resp: MockAPIResponse = {
      url: () => 'http://localhost/api/file',
      status: () => 200,
      headers: () => ({ 'content-type': 'text/html' }),
      body: () => Promise.resolve(Buffer.from('<html>not json</html>')),
    };
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.get('/api/file');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('handles empty response body gracefully', async () => {
    const hits: EndpointHit[] = [];
    const resp: MockAPIResponse = {
      url: () => 'http://localhost/api/empty',
      status: () => 204,
      headers: () => ({ 'content-type': 'application/json' }),
      body: () => Promise.resolve(Buffer.from('')),
    };
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    await tracked.delete('/api/users/1');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('returns the original response to the caller', async () => {
    const hits: EndpointHit[] = [];
    const expectedResp = makeResponse({ url: 'http://localhost/api/users', status: 201 });
    const ctx = makeMockContext(expectedResp);
    const tracked = buildTrackedRequest(ctx as never, hits, testInfo);
    const response = await tracked.post('/api/users', { data: { name: 'test' } });
    expect(response.url()).toBe('http://localhost/api/users');
    expect(response.status()).toBe(201);
  });
});
