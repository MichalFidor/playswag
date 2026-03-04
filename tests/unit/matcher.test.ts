import { describe, it, expect } from 'vitest';
import { stripToPath, matchTemplate, matchOperation } from '../../src/openapi/matcher.js';
import type { NormalizedOperation } from '../../src/types.js';

describe('stripToPath', () => {
  it('strips base URL and query params from an absolute URL', () => {
    expect(
      stripToPath('https://api.example.com/api/users/123?foo=bar', 'https://api.example.com')
    ).toBe('/api/users/123');
  });

  it('strips base URL with a path prefix', () => {
    expect(
      stripToPath('https://api.example.com/v1/users', 'https://api.example.com/v1')
    ).toBe('/users');
  });

  it('handles relative paths (no base)', () => {
    expect(stripToPath('/api/users/123?a=b')).toBe('/api/users/123');
  });

  it('normalises trailing slash', () => {
    expect(stripToPath('https://api.example.com/api/users/', 'https://api.example.com')).toBe(
      '/api/users'
    );
  });

  it('returns / for a bare base URL', () => {
    expect(stripToPath('https://api.example.com/', 'https://api.example.com')).toBe('/');
  });

  it('decodes percent-encoded characters', () => {
    expect(stripToPath('https://api.example.com/users/hello%20world')).toBe(
      '/users/hello world'
    );
  });

  it('strips a serverBasePath prefix after stripping baseURL', () => {
    expect(
      stripToPath('https://api.example.com/svc/v1/users/123', 'https://api.example.com', '/svc')
    ).toBe('/v1/users/123');
  });

  it('strips serverBasePath when baseURL includes only the host', () => {
    expect(
      stripToPath('https://api.example.com/modeling-service/v1/projects', 'https://api.example.com', '/modeling-service')
    ).toBe('/v1/projects');
  });

  it('is a no-op for serverBasePath when baseURL already includes the prefix', () => {
    expect(
      stripToPath('https://api.example.com/modeling-service/v1/projects', 'https://api.example.com/modeling-service', '/modeling-service')
    ).toBe('/v1/projects');
  });

  it('leaves path unchanged when serverBasePath does not match', () => {
    expect(
      stripToPath('https://api.example.com/other/v1/users', 'https://api.example.com', '/svc')
    ).toBe('/other/v1/users');
  });
});

describe('matchTemplate', () => {
  it('matches an exact literal path', () => {
    const result = matchTemplate('/api/users', '/api/users');
    expect(result).not.toBeNull();
    expect(result!.score).toBe(2);
    expect(result!.pathParams).toEqual({});
  });

  it('matches a path with a parameter', () => {
    const result = matchTemplate('/api/users/123', '/api/users/{id}');
    expect(result).not.toBeNull();
    expect(result!.pathParams).toEqual({ id: '123' });
    expect(result!.score).toBe(2); // /api and /users are literal
  });

  it('extracts multiple path parameters', () => {
    const result = matchTemplate('/api/users/42/orders/99', '/api/users/{userId}/orders/{orderId}');
    expect(result).not.toBeNull();
    expect(result!.pathParams).toEqual({ userId: '42', orderId: '99' });
  });

  it('returns null for different segment counts', () => {
    expect(matchTemplate('/api/users/123/extra', '/api/users/{id}')).toBeNull();
  });

  it('returns null for mismatched literals', () => {
    expect(matchTemplate('/api/orders/123', '/api/users/{id}')).toBeNull();
  });

  it('is case-insensitive for literals', () => {
    expect(matchTemplate('/API/Users', '/api/users')).not.toBeNull();
  });
});

describe('matchOperation', () => {
  const ops: NormalizedOperation[] = [
    {
      pathTemplate: '/api/users',
      method: 'GET',
      parameters: [],
      responses: { '200': {} },
    },
    {
      pathTemplate: '/api/users/{id}',
      method: 'GET',
      parameters: [{ name: 'id', in: 'path', required: true }],
      responses: { '200': {}, '404': {} },
    },
    {
      pathTemplate: '/api/users/me',
      method: 'GET',
      parameters: [],
      responses: { '200': {} },
    },
    {
      pathTemplate: '/api/users',
      method: 'POST',
      parameters: [],
      responses: { '201': {} },
    },
  ];

  it('matches an exact path', () => {
    const match = matchOperation('https://api.example.com/api/users', 'GET', ops, 'https://api.example.com');
    expect(match).not.toBeNull();
    expect(match!.operation.pathTemplate).toBe('/api/users');
    expect(match!.operation.method).toBe('GET');
  });

  it('prefers the more specific literal match over a parameter template', () => {
    // /api/users/me should match /api/users/me (score 3) over /api/users/{id} (score 2)
    const match = matchOperation('https://api.example.com/api/users/me', 'GET', ops, 'https://api.example.com');
    expect(match).not.toBeNull();
    expect(match!.operation.pathTemplate).toBe('/api/users/me');
  });

  it('matches a parameterised path and extracts params', () => {
    const match = matchOperation('https://api.example.com/api/users/456', 'GET', ops, 'https://api.example.com');
    expect(match).not.toBeNull();
    expect(match!.operation.pathTemplate).toBe('/api/users/{id}');
    expect(match!.pathParams).toEqual({ id: '456' });
  });

  it('matches based on HTTP method', () => {
    const match = matchOperation('https://api.example.com/api/users', 'POST', ops, 'https://api.example.com');
    expect(match).not.toBeNull();
    expect(match!.operation.method).toBe('POST');
  });

  it('returns null when no operation matches', () => {
    const match = matchOperation('https://api.example.com/api/nonexistent', 'GET', ops, 'https://api.example.com');
    expect(match).toBeNull();
  });

  it('returns null for wrong method', () => {
    const match = matchOperation('https://api.example.com/api/users', 'DELETE', ops, 'https://api.example.com');
    expect(match).toBeNull();
  });

  it('matches when URL contains a server base path that should be stripped (per-op serverBasePath)', () => {
    const opsWithBasePath = ops.map(op => ({ ...op, serverBasePath: '/my-service' }));
    const match = matchOperation(
      'https://host/my-service/api/users/123',
      'GET',
      opsWithBasePath,
      'https://host'
    );
    expect(match).not.toBeNull();
    expect(match!.operation.pathTemplate).toBe('/api/users/{id}');
    expect(match!.pathParams).toEqual({ id: '123' });
  });

  it('matches with serverBasePath when baseURL already includes service prefix (no double-strip)', () => {
    const opsWithBasePath = ops.map(op => ({ ...op, serverBasePath: '/my-service' }));
    const match = matchOperation(
      'https://host/my-service/api/users',
      'GET',
      opsWithBasePath,
      'https://host/my-service'
    );
    expect(match).not.toBeNull();
    expect(match!.operation.pathTemplate).toBe('/api/users');
  });

  it('matches operations from different services by their own serverBasePath', () => {
    const multiServiceOps: NormalizedOperation[] = [
      { pathTemplate: '/v1/foo', method: 'GET', parameters: [], responses: {}, serverBasePath: '/svc-a' },
      { pathTemplate: '/v1/bar', method: 'GET', parameters: [], responses: {}, serverBasePath: '/svc-b' },
    ];
    const matchA = matchOperation('https://host/svc-a/v1/foo', 'GET', multiServiceOps, 'https://host');
    expect(matchA?.operation.pathTemplate).toBe('/v1/foo');
    const matchB = matchOperation('https://host/svc-b/v1/bar', 'GET', multiServiceOps, 'https://host');
    expect(matchB?.operation.pathTemplate).toBe('/v1/bar');
  });
});
