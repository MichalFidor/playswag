import { describe, it, expect, vi } from 'vitest';

/**
 * The fixture module depends on '@playwright/test' which is heavy for unit tests.
 * We test the core proxy logic by reimplementing `buildTrackedRequest` inline
 * (extracted from src/fixture.ts) against a mocked APIRequestContext.
 *
 * This approach validates the interception and hit-recording logic without
 * needing a real Playwright runtime.
 */

interface MockAPIResponse {
  url(): string;
  status(): number;
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

const INTERCEPTED_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;
type HttpMethod = (typeof INTERCEPTED_METHODS)[number];

/**
 * Mirror of the buildTrackedRequest function from src/fixture.ts
 * extracted here for isolated unit testing.
 */
function buildTrackedRequest<T extends MockAPIRequestContext>(
  original: T,
  hits: EndpointHit[],
  testInfo: { titlePath: string[]; title: string },
  captureResponseBody = true
): T {
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (!INTERCEPTED_METHODS.includes(prop as HttpMethod)) {
        return Reflect.get(target, prop, receiver);
      }
      const method = prop as HttpMethod;
      return async (urlOrRequest: string | object, options?: Record<string, unknown>): Promise<MockAPIResponse> => {
        let httpMethod: string;
        if (method === 'fetch') {
          httpMethod = (typeof options?.['method'] === 'string' ? options['method'] : 'GET').toUpperCase();
        } else {
          httpMethod = method.toUpperCase();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: MockAPIResponse = await (target[method] as any).call(target, urlOrRequest, options);

        let queryParams: Record<string, string> | undefined;
        const rawParams = options?.['params'];
        if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
          queryParams = Object.fromEntries(
            Object.entries(rawParams as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          );
        }
        // Also extract query params from the final response URL so that string-concatenated
        // ?param=value patterns (e.g. request.get(`/users?limit=${n}`)) are captured.
        // URL-derived params are merged first; explicit options.params take precedence.
        try {
          const urlSearchParams = new URL(response.url()).searchParams;
          if (urlSearchParams.size > 0) {
            const fromUrl: Record<string, string> = {};
            urlSearchParams.forEach((value, key) => { fromUrl[key] = value; });
            queryParams = { ...fromUrl, ...queryParams };
          }
        } catch {
          // Invalid URL — skip URL param extraction
        }

        let headers: Record<string, string> | undefined;
        const rawHeaders = options?.['headers'];
        if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
          headers = Object.fromEntries(
            Object.entries(rawHeaders as Record<string, string>).map(([k, v]) => [k, String(v)])
          );
        }

        const requestBody = options?.['data'] ?? options?.['form'] ?? options?.['multipart'] ?? undefined;

        let responseBody: unknown | undefined;
        if (captureResponseBody) {
          try {
            const raw = await response.body();
            if (raw.length > 0) {
              responseBody = JSON.parse(raw.toString('utf8'));
            }
          } catch {
            // Non-JSON or empty response
          }
        }

        hits.push({
          method: httpMethod,
          url: response.url(),
          statusCode: response.status(),
          requestBody,
          responseBody,
          queryParams,
          headers,
          testFile: testInfo.titlePath[0] ?? '',
          testTitle: testInfo.title,
        });

        return response;
      };
    },
  }) as T;
}

function makeResponse(overrides: Partial<{ url: string; status: number; body: unknown }> = {}): MockAPIResponse {
  const { url = 'http://localhost:3456/api/users', status = 200, body = { id: '1' } } = overrides;
  return {
    url: () => url,
    status: () => status,
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

const testInfo = { titlePath: ['test.spec.ts'], title: 'my test' };

describe('buildTrackedRequest (fixture proxy)', () => {
  it('intercepts GET and records a hit', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.method).toBe('GET');
    expect(hits[0]?.url).toBe('http://localhost:3456/api/users');
    expect(hits[0]?.statusCode).toBe(200);
  });

  it('intercepts POST and records a hit', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.post('http://localhost:3456/api/users', { data: { name: 'Alice' } });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.method).toBe('POST');
  });

  it('records requestBody from data option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.post('/api/users', { data: { name: 'Bob', email: 'b@b.com' } });
    expect(hits[0]?.requestBody).toEqual({ name: 'Bob', email: 'b@b.com' });
  });

  it('records requestBody from form option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.post('/api/users', { form: { name: 'FormUser' } });
    expect(hits[0]?.requestBody).toEqual({ name: 'FormUser' });
  });

  it('records query params when provided', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('/api/users', { params: { limit: 10, offset: 0 } });
    expect(hits[0]?.queryParams).toEqual({ limit: '10', offset: '0' });
  });

  it('extracts query params from URL string when no params option provided', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ url: 'http://localhost:3456/api/users?limit=5&page=2' });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users?limit=5&page=2');
    expect(hits[0]?.queryParams).toEqual({ limit: '5', page: '2' });
  });

  it('merges URL query params with params option; params option wins on conflict', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ url: 'http://localhost:3456/api/users?limit=5&page=2' });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('http://localhost:3456/api/users?page=2', { params: { limit: 10 } });
    expect(hits[0]?.queryParams).toEqual({ limit: '10', page: '2' });
  });

  it('records headers when provided', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('/api/users', { headers: { 'X-Trace-Id': 'abc123' } });
    expect(hits[0]?.headers).toEqual({ 'X-Trace-Id': 'abc123' });
  });

  it('captures response body by default', async () => {
    const hits: EndpointHit[] = [];
    const resp = makeResponse({ body: { status: 'ok' } });
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('/api/health');
    expect(hits[0]?.responseBody).toEqual({ status: 'ok' });
  });

  it('skips response body capture when captureResponseBody is false', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo, false);
    await tracked.get('/api/users');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('sets testFile and testTitle from testInfo', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, { titlePath: ['my-file.spec.ts'], title: 'gets users' });
    await tracked.get('/api/users');
    expect(hits[0]?.testFile).toBe('my-file.spec.ts');
    expect(hits[0]?.testTitle).toBe('gets users');
  });

  it('uses GET as default method for fetch without method option', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.fetch('/api/health');
    expect(hits[0]?.method).toBe('GET');
  });

  it('uses provided method option for fetch', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.fetch('/api/users', { method: 'POST', data: { name: 'Alice' } });
    expect(hits[0]?.method).toBe('POST');
  });

  it('passes through non-intercepted methods without recording', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.dispose();
    expect(hits).toHaveLength(0);
    expect(ctx.dispose).toHaveBeenCalled();
  });

  it('intercepts all HTTP methods', async () => {
    const hits: EndpointHit[] = [];
    const ctx = makeMockContext();
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
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
      body: () => Promise.resolve(Buffer.from('<html>not json</html>')),
    };
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.get('/api/file');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('handles empty response body gracefully', async () => {
    const hits: EndpointHit[] = [];
    const resp: MockAPIResponse = {
      url: () => 'http://localhost/api/empty',
      status: () => 204,
      body: () => Promise.resolve(Buffer.from('')),
    };
    const ctx = makeMockContext(resp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    await tracked.delete('/api/users/1');
    expect(hits[0]?.responseBody).toBeUndefined();
  });

  it('returns the original response to the caller', async () => {
    const hits: EndpointHit[] = [];
    const expectedResp = makeResponse({ url: 'http://localhost/api/users', status: 201 });
    const ctx = makeMockContext(expectedResp);
    const tracked = buildTrackedRequest(ctx, hits, testInfo);
    const response = await tracked.post('/api/users', { data: { name: 'test' } });
    expect(response.url()).toBe('http://localhost/api/users');
    expect(response.status()).toBe(201);
  });
});
