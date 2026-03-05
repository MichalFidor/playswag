/**
 * Generates a rich demo HTML coverage report using the local build.
 * Run: npm run demo
 * Opens demo-report.html in the project root.
 */

import { writeFile, readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateHtmlReport } from '../dist/esm/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/** @type {import('../dist/types/types.js').CoverageResult} */
const result = {
  specFiles: ['./openapi/users.yaml', './openapi/products.yaml'],
  timestamp: new Date().toISOString(),
  playwrightVersion: '1.52.0',
  playswagVersion: '1.5.4',
  totalTestCount: 47,
  summary: {
    endpoints:        { total: 18, covered: 14, percentage: 77.8 },
    statusCodes:      { total: 42, covered: 29, percentage: 69.0 },
    parameters:       { total: 31, covered: 22, percentage: 71.0 },
    bodyProperties:   { total: 24, covered: 19, percentage: 79.2 },
    responseProperties: { total: 16, covered: 9, percentage: 56.3 },
  },
  operations: [
    // ── users tag ────────────────────────────────────────────────────────────
    {
      path: '/api/v1/users',
      method: 'GET',
      operationId: 'listUsers',
      covered: true,
      tags: ['users'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['GET /users — returns paginated list'] },
        '401': { covered: true,  testRefs: ['GET /users — rejects unauthenticated'] },
        '403': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'page',   in: 'query',  required: false, covered: true  },
        { name: 'limit',  in: 'query',  required: false, covered: true  },
        { name: 'search', in: 'query',  required: false, covered: false },
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [],
      responseProperties: [
        { name: 'items',      statusCode: '200', required: true,  covered: true  },
        { name: 'totalCount', statusCode: '200', required: true,  covered: true  },
        { name: 'nextCursor', statusCode: '200', required: false, covered: false },
      ],
      testRefs: [
        'GET /users — returns paginated list',
        'GET /users — rejects unauthenticated',
      ],
    },
    {
      path: '/api/v1/users',
      method: 'POST',
      operationId: 'createUser',
      covered: true,
      tags: ['users'],
      statusCodes: {
        '201': { covered: true,  testRefs: ['POST /users — creates a new user'] },
        '400': { covered: true,  testRefs: ['POST /users — rejects invalid payload'] },
        '409': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [
        { name: 'email',     required: true,  covered: true  },
        { name: 'password',  required: true,  covered: true  },
        { name: 'firstName', required: false, covered: true  },
        { name: 'lastName',  required: false, covered: false },
        { name: 'role',      required: false, covered: false },
      ],
      responseProperties: [
        { name: 'id',        statusCode: '201', required: true,  covered: true  },
        { name: 'email',     statusCode: '201', required: true,  covered: true  },
        { name: 'createdAt', statusCode: '201', required: false, covered: false },
      ],
      testRefs: [
        'POST /users — creates a new user',
        'POST /users — rejects invalid payload',
      ],
    },
    {
      path: '/api/v1/users/{id}',
      method: 'GET',
      operationId: 'getUser',
      covered: true,
      tags: ['users'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['GET /users/:id — returns user'] },
        '404': { covered: true,  testRefs: ['GET /users/:id — returns 404 for unknown id'] },
      },
      parameters: [
        { name: 'id',            in: 'path',   required: true,  covered: true },
        { name: 'Authorization', in: 'header', required: true,  covered: true },
      ],
      bodyProperties: [],
      responseProperties: [
        { name: 'id',        statusCode: '200', required: true,  covered: true },
        { name: 'email',     statusCode: '200', required: true,  covered: true },
        { name: 'firstName', statusCode: '200', required: false, covered: true },
        { name: 'lastName',  statusCode: '200', required: false, covered: true },
      ],
      testRefs: [
        'GET /users/:id — returns user',
        'GET /users/:id — returns 404 for unknown id',
      ],
    },
    {
      path: '/api/v1/users/{id}',
      method: 'PATCH',
      operationId: 'updateUser',
      covered: false,
      tags: ['users'],
      statusCodes: {
        '200': { covered: false, testRefs: [] },
        '400': { covered: false, testRefs: [] },
        '404': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'id',            in: 'path',   required: true,  covered: false },
        { name: 'Authorization', in: 'header', required: true,  covered: false },
      ],
      bodyProperties: [
        { name: 'firstName', required: false, covered: false },
        { name: 'lastName',  required: false, covered: false },
      ],
      responseProperties: [],
      testRefs: [],
    },
    {
      path: '/api/v1/users/{id}',
      method: 'DELETE',
      operationId: 'deleteUser',
      covered: true,
      tags: ['users'],
      statusCodes: {
        '204': { covered: true,  testRefs: ['DELETE /users/:id — deletes user'] },
        '404': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'id',            in: 'path',   required: true,  covered: true  },
        { name: 'Authorization', in: 'header', required: true,  covered: true  },
      ],
      bodyProperties: [],
      responseProperties: [],
      testRefs: ['DELETE /users/:id — deletes user'],
    },

    // ── products tag ─────────────────────────────────────────────────────────
    {
      path: '/api/v1/products',
      method: 'GET',
      operationId: 'listProducts',
      covered: true,
      tags: ['products'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['GET /products — returns list'] },
        '400': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'category', in: 'query',  required: false, covered: true  },
        { name: 'minPrice', in: 'query',  required: false, covered: false },
        { name: 'maxPrice', in: 'query',  required: false, covered: false },
        { name: 'sort',     in: 'query',  required: false, covered: true  },
      ],
      bodyProperties: [],
      responseProperties: [
        { name: 'items', statusCode: '200', required: true, covered: true },
        { name: 'total', statusCode: '200', required: true, covered: true },
      ],
      testRefs: ['GET /products — returns list'],
    },
    {
      path: '/api/v1/products',
      method: 'POST',
      operationId: 'createProduct',
      covered: true,
      tags: ['products'],
      statusCodes: {
        '201': { covered: true,  testRefs: ['POST /products — creates product'] },
        '400': { covered: true,  testRefs: ['POST /products — rejects missing name'] },
        '403': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [
        { name: 'name',        required: true,  covered: true  },
        { name: 'description', required: false, covered: true  },
        { name: 'price',       required: true,  covered: true  },
        { name: 'category',    required: false, covered: false },
        { name: 'stock',       required: false, covered: false },
      ],
      responseProperties: [
        { name: 'id',   statusCode: '201', required: true, covered: true  },
        { name: 'slug', statusCode: '201', required: false, covered: false },
      ],
      testRefs: [
        'POST /products — creates product',
        'POST /products — rejects missing name',
      ],
    },
    {
      path: '/api/v1/products/{id}',
      method: 'GET',
      operationId: 'getProduct',
      covered: true,
      tags: ['products'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['GET /products/:id — returns product'] },
        '404': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'id', in: 'path', required: true, covered: true },
      ],
      bodyProperties: [],
      responseProperties: [
        { name: 'name',  statusCode: '200', required: true,  covered: true },
        { name: 'price', statusCode: '200', required: true,  covered: true },
      ],
      testRefs: ['GET /products/:id — returns product'],
    },
    {
      path: '/api/v1/products/{id}',
      method: 'DELETE',
      operationId: 'deleteProduct',
      covered: false,
      tags: ['products'],
      statusCodes: {
        '204': { covered: false, testRefs: [] },
        '403': { covered: false, testRefs: [] },
        '404': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'id',            in: 'path',   required: true, covered: false },
        { name: 'Authorization', in: 'header', required: true, covered: false },
      ],
      bodyProperties: [],
      responseProperties: [],
      testRefs: [],
    },

    // ── orders tag ───────────────────────────────────────────────────────────
    {
      path: '/api/v1/orders',
      method: 'GET',
      operationId: 'listOrders',
      covered: true,
      tags: ['orders'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['GET /orders — returns orders'] },
        '401': { covered: true,  testRefs: ['GET /orders — rejects unauthenticated'] },
      },
      parameters: [
        { name: 'status',        in: 'query',  required: false, covered: true  },
        { name: 'Authorization', in: 'header', required: true,  covered: true  },
      ],
      bodyProperties: [],
      responseProperties: [
        { name: 'orders', statusCode: '200', required: true, covered: true },
      ],
      testRefs: [
        'GET /orders — returns orders',
        'GET /orders — rejects unauthenticated',
      ],
    },
    {
      path: '/api/v1/orders',
      method: 'POST',
      operationId: 'createOrder',
      covered: true,
      tags: ['orders'],
      statusCodes: {
        '201': { covered: true,  testRefs: ['POST /orders — places order'] },
        '400': { covered: true,  testRefs: ['POST /orders — rejects empty cart'] },
        '402': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [
        { name: 'items',     required: true,  covered: true  },
        { name: 'addressId', required: true,  covered: true  },
        { name: 'coupon',    required: false, covered: false },
      ],
      responseProperties: [
        { name: 'orderId', statusCode: '201', required: true, covered: true },
        { name: 'total',   statusCode: '201', required: true, covered: false },
      ],
      testRefs: [
        'POST /orders — places order',
        'POST /orders — rejects empty cart',
      ],
    },
    {
      path: '/api/v1/orders/{id}/cancel',
      method: 'POST',
      operationId: 'cancelOrder',
      covered: false,
      tags: ['orders'],
      statusCodes: {
        '200': { covered: false, testRefs: [] },
        '404': { covered: false, testRefs: [] },
        '409': { covered: false, testRefs: [] },
      },
      parameters: [
        { name: 'id',            in: 'path',   required: true, covered: false },
        { name: 'Authorization', in: 'header', required: true, covered: false },
      ],
      bodyProperties: [],
      responseProperties: [],
      testRefs: [],
    },

    // ── auth tag ─────────────────────────────────────────────────────────────
    {
      path: '/api/v1/auth/login',
      method: 'POST',
      operationId: 'login',
      covered: true,
      tags: ['auth'],
      statusCodes: {
        '200': { covered: true,  testRefs: ['POST /auth/login — returns token'] },
        '401': { covered: true,  testRefs: ['POST /auth/login — rejects wrong password'] },
        '429': { covered: false, testRefs: [] },
      },
      parameters: [],
      bodyProperties: [
        { name: 'email',    required: true, covered: true },
        { name: 'password', required: true, covered: true },
      ],
      responseProperties: [
        { name: 'token',     statusCode: '200', required: true,  covered: true  },
        { name: 'expiresAt', statusCode: '200', required: false, covered: false },
      ],
      testRefs: [
        'POST /auth/login — returns token',
        'POST /auth/login — rejects wrong password',
      ],
    },
    {
      path: '/api/v1/auth/logout',
      method: 'POST',
      operationId: 'logout',
      covered: true,
      tags: ['auth'],
      statusCodes: {
        '204': { covered: true, testRefs: ['POST /auth/logout — clears session'] },
      },
      parameters: [
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [],
      responseProperties: [],
      testRefs: ['POST /auth/logout — clears session'],
    },
    {
      path: '/api/v1/auth/refresh',
      method: 'POST',
      operationId: 'refreshToken',
      covered: false,
      tags: ['auth'],
      statusCodes: {
        '200': { covered: false, testRefs: [] },
        '401': { covered: false, testRefs: [] },
      },
      parameters: [],
      bodyProperties: [
        { name: 'refreshToken', required: true, covered: false },
      ],
      responseProperties: [],
      testRefs: [],
    },

    // ── no tag → General ─────────────────────────────────────────────────────
    {
      path: '/api/v1/health',
      method: 'GET',
      operationId: 'healthCheck',
      covered: true,
      tags: [],
      statusCodes: {
        '200': { covered: true, testRefs: ['GET /health — returns ok'] },
      },
      parameters: [],
      bodyProperties: [],
      responseProperties: [
        { name: 'status', statusCode: '200', required: true, covered: true },
      ],
      testRefs: ['GET /health — returns ok'],
    },
    {
      path: '/api/v1/version',
      method: 'GET',
      operationId: 'getVersion',
      covered: false,
      tags: [],
      statusCodes: {
        '200': { covered: false, testRefs: [] },
      },
      parameters: [],
      bodyProperties: [],
      responseProperties: [],
      testRefs: [],
    },
  ],
  uncoveredOperations: [],
  unmatchedHits: [
    {
      method: 'GET',
      url: 'http://localhost:3000/api/v1/internal/metrics',
      statusCode: 200,
      testTitle: 'admin dashboard — loads metrics',
      testFile: 'tests/admin.spec.ts',
    },
    {
      method: 'POST',
      url: 'http://localhost:3000/api/v1/webhooks/stripe',
      statusCode: 200,
      testTitle: 'payment — processes stripe webhook',
      testFile: 'tests/payment.spec.ts',
    },
  ],
};

/** Mock history for sparklines — last 6 runs */
const historyEntries = [
  { timestamp: '2026-02-28T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 8,  percentage: 44.4 }, statusCodes: { total: 42, covered: 17, percentage: 40.5 }, parameters: { total: 31, covered: 11, percentage: 35.5 }, bodyProperties: { total: 24, covered: 10, percentage: 41.7 }, responseProperties: { total: 16, covered: 4, percentage: 25.0 } } },
  { timestamp: '2026-03-01T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 9,  percentage: 50.0 }, statusCodes: { total: 42, covered: 19, percentage: 45.2 }, parameters: { total: 31, covered: 13, percentage: 41.9 }, bodyProperties: { total: 24, covered: 12, percentage: 50.0 }, responseProperties: { total: 16, covered: 5, percentage: 31.3 } } },
  { timestamp: '2026-03-02T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 10, percentage: 55.6 }, statusCodes: { total: 42, covered: 21, percentage: 50.0 }, parameters: { total: 31, covered: 15, percentage: 48.4 }, bodyProperties: { total: 24, covered: 14, percentage: 58.3 }, responseProperties: { total: 16, covered: 6, percentage: 37.5 } } },
  { timestamp: '2026-03-03T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 11, percentage: 61.1 }, statusCodes: { total: 42, covered: 23, percentage: 54.8 }, parameters: { total: 31, covered: 17, percentage: 54.8 }, bodyProperties: { total: 24, covered: 16, percentage: 66.7 }, responseProperties: { total: 16, covered: 7, percentage: 43.8 } } },
  { timestamp: '2026-03-04T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 12, percentage: 66.7 }, statusCodes: { total: 42, covered: 25, percentage: 59.5 }, parameters: { total: 31, covered: 19, percentage: 61.3 }, bodyProperties: { total: 24, covered: 17, percentage: 70.8 }, responseProperties: { total: 16, covered: 8, percentage: 50.0 } } },
  { timestamp: '2026-03-05T10:00:00.000Z', summary: { endpoints: { total: 18, covered: 13, percentage: 72.2 }, statusCodes: { total: 42, covered: 27, percentage: 64.3 }, parameters: { total: 31, covered: 20, percentage: 64.5 }, bodyProperties: { total: 24, covered: 18, percentage: 75.0 }, responseProperties: { total: 16, covered: 8, percentage: 50.0 } } },
];

const logoBuffer = await readFile(resolve(ROOT, 'assets/logo.png'));
const logoDataUrl = `data:image/png;base64,${logoBuffer.toString('base64')}`;

const html = generateHtmlReport(result, { title: 'E-Commerce API Coverage' }, logoDataUrl, historyEntries);
const outPath = resolve(ROOT, 'demo-report.html');
await writeFile(outPath, html, 'utf8');
console.log(`\nDemo report written to: ${outPath}`);
console.log('Open in your browser: open demo-report.html\n');
