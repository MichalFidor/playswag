/**
 * Shared example spec used by every configuration scenario.
 *
 * Exercises all five operations defined in sample-openapi.yaml, covering multiple
 * status codes, all defined query/path params, and all request body properties.
 * This gives the reporter enough data to produce meaningful coverage metrics.
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

test('GET /api/users', async ({ request }) => {
  const res = await request.get('/api/users');
  expect(res.status()).toBe(200);
});

test('GET /api/users with limit + offset params', async ({ request }) => {
  const res = await request.get('/api/users', { params: { limit: '1', offset: '0' } });
  expect(res.status()).toBe(200);
});

test('POST /api/users — 201 created', async ({ request }) => {
  const res = await request.post('/api/users', {
    data: { name: 'Diana', email: 'diana@example.com', role: 'editor' },
  });
  expect(res.status()).toBe(201);
});

test('POST /api/users — 422 validation error', async ({ request }) => {
  const res = await request.post('/api/users', { data: { name: 'NoEmail' } });
  expect(res.status()).toBe(422);
});

test('GET /api/users/:id — 200 found', async ({ request }) => {
  const res = await request.get('/api/users/1');
  expect(res.status()).toBe(200);
});

test('GET /api/users/:id — 404 not found', async ({ request }) => {
  const res = await request.get('/api/users/999');
  expect(res.status()).toBe(404);
});

test('DELETE /api/users/:id — 204 deleted', async ({ request }) => {
  const res = await request.delete('/api/users/1');
  expect(res.status()).toBe(204);
});

test('DELETE /api/users/:id — 404 not found', async ({ request }) => {
  const res = await request.delete('/api/users/999');
  expect(res.status()).toBe(404);
});

test('GET /api/health', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.status()).toBe(200);
});
