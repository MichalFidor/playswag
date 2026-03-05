/**
 * Example spec demonstrating per-test fixture options.
 *
 * Verifiable outcomes (checked by the runner test):
 * - Tests inside `playswagEnabled: false` are NOT included in coverage hits.
 * - Tests inside `captureResponseBody: false` ARE included in endpoint coverage
 *   but contribute zero response property coverage for those operations.
 */
import { test, expect } from '../../src/index.js';
import { createMockServer, resetMockServer } from '../integration/mock-server.js';
import type { Server } from 'node:http';

const PORT = 3457;
let server: Server | undefined;

test.beforeAll(async () => {
  ({ server } = await createMockServer(PORT));
});

test.beforeEach(() => {
  resetMockServer();
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server?.close(() => resolve()));
});

test.describe('playswagEnabled: false', () => {
  test.use({ playswagEnabled: false });

  test('GET /api/users — not tracked', async ({ request }) => {
    const res = await request.get('/api/users');
    expect(res.status()).toBe(200);
  });

  test('POST /api/users — not tracked', async ({ request }) => {
    const res = await request.post('/api/users', {
      data: { name: 'Ghost', email: 'ghost@example.com' },
    });
    expect(res.status()).toBe(201);
  });
});

test.describe('captureResponseBody: false', () => {
  test.use({ captureResponseBody: false });

  test('GET /api/users/:id — tracked, no response body captured', async ({ request }) => {
    const res = await request.get('/api/users/1');
    expect(res.status()).toBe(200);
  });
});

test('GET /api/health — normal tracking', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});
