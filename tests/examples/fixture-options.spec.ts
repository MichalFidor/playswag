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

// ─── playswagEnabled: false ───────────────────────────────────────────────────
// Requests go through normally but are NOT recorded.
// GET /api/users and POST /api/users will NOT appear in the coverage report.

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

// ─── captureResponseBody: false ───────────────────────────────────────────────
// Hits ARE recorded (endpoint + status code coverage works), but the response
// body is discarded, so response property coverage stays at 0 for these ops.

test.describe('captureResponseBody: false', () => {
  test.use({ captureResponseBody: false });

  test('GET /api/users/:id — tracked, no response body captured', async ({ request }) => {
    // GET /api/users/{id} has a response schema with id/name/email properties.
    // Without the body none of those properties will be marked covered.
    const res = await request.get('/api/users/1');
    expect(res.status()).toBe(200);
  });
});

// ─── Normal tracking ─────────────────────────────────────────────────────────
// Full hit recorded with response body — endpoint + response props covered.

test('GET /api/health — normal tracking', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});
