import { writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateMarkdownReport } from '../dist/esm/index.js';

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
    endpoints:          { total: 18, covered: 14, percentage: 77.8 },
    statusCodes:        { total: 42, covered: 29, percentage: 69.0 },
    parameters:         { total: 31, covered: 22, percentage: 71.0 },
    bodyProperties:     { total: 24, covered: 19, percentage: 79.2 },
    responseProperties: { total: 16, covered: 9,  percentage: 56.3 },
  },
  operations: [
    {
      path: '/api/v1/users', method: 'GET', covered: true, tags: ['users'],
      statusCodes: { '200': { covered: true, testRefs: [] }, '401': { covered: true, testRefs: [] }, '403': { covered: false, testRefs: [] } },
      parameters: [
        { name: 'page', in: 'query', required: false, covered: true },
        { name: 'limit', in: 'query', required: false, covered: true },
        { name: 'search', in: 'query', required: false, covered: false },
        { name: 'Authorization', in: 'header', required: true, covered: true },
      ],
      bodyProperties: [], responseProperties: [],
      testRefs: ['GET /users — returns paginated list', 'GET /users — rejects unauthenticated'],
    },
    {
      path: '/api/v1/users', method: 'POST', covered: true, tags: ['users'],
      statusCodes: { '201': { covered: true, testRefs: [] }, '400': { covered: true, testRefs: [] }, '409': { covered: false, testRefs: [] } },
      parameters: [{ name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [
        { name: 'email', required: true, covered: true },
        { name: 'password', required: true, covered: true },
        { name: 'name', required: false, covered: true },
        { name: 'role', required: false, covered: false },
      ],
      responseProperties: [], testRefs: ['POST /users — creates account', 'POST /users — rejects duplicate email'],
    },
    {
      path: '/api/v1/users/{id}', method: 'GET', covered: true, tags: ['users'],
      statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: true, testRefs: [] } },
      parameters: [{ name: 'id', in: 'path', required: true, covered: true }, { name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [], responseProperties: [], testRefs: ['GET /users/:id — returns user'],
    },
    {
      path: '/api/v1/users/{id}', method: 'PUT', covered: false, tags: ['users'],
      statusCodes: { '200': { covered: false, testRefs: [] }, '404': { covered: false, testRefs: [] } },
      parameters: [{ name: 'id', in: 'path', required: true, covered: false }, { name: 'Authorization', in: 'header', required: true, covered: false }],
      bodyProperties: [{ name: 'name', required: false, covered: false }, { name: 'role', required: false, covered: false }],
      responseProperties: [], testRefs: [],
    },
    {
      path: '/api/v1/users/{id}', method: 'DELETE', covered: true, tags: ['users'],
      statusCodes: { '204': { covered: true, testRefs: [] }, '404': { covered: true, testRefs: [] } },
      parameters: [{ name: 'id', in: 'path', required: true, covered: true }, { name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [], responseProperties: [], testRefs: ['DELETE /users/:id — removes user'],
    },
    {
      path: '/api/v1/products', method: 'GET', covered: true, tags: ['products'],
      statusCodes: { '200': { covered: true, testRefs: [] }, '401': { covered: false, testRefs: [] } },
      parameters: [{ name: 'category', in: 'query', required: false, covered: true }, { name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [], responseProperties: [], testRefs: ['GET /products — lists by category'],
    },
    {
      path: '/api/v1/products', method: 'POST', covered: true, tags: ['products'],
      statusCodes: { '201': { covered: true, testRefs: [] }, '400': { covered: true, testRefs: [] } },
      parameters: [{ name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [{ name: 'name', required: true, covered: true }, { name: 'price', required: true, covered: true }, { name: 'sku', required: true, covered: true }],
      responseProperties: [], testRefs: ['POST /products — creates item'],
    },
    {
      path: '/api/v1/products/{id}', method: 'GET', covered: true, tags: ['products'],
      statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: true, testRefs: [] } },
      parameters: [{ name: 'id', in: 'path', required: true, covered: true }],
      bodyProperties: [], responseProperties: [], testRefs: ['GET /products/:id'],
    },
    {
      path: '/api/v1/products/{id}', method: 'PATCH', covered: false, tags: ['products'],
      statusCodes: { '200': { covered: false, testRefs: [] }, '404': { covered: false, testRefs: [] } },
      parameters: [{ name: 'id', in: 'path', required: true, covered: false }],
      bodyProperties: [{ name: 'price', required: false, covered: false }],
      responseProperties: [], testRefs: [],
    },
    {
      path: '/api/v1/auth/login', method: 'POST', covered: true, tags: ['auth'],
      statusCodes: { '200': { covered: true, testRefs: [] }, '401': { covered: true, testRefs: [] } },
      parameters: [],
      bodyProperties: [{ name: 'email', required: true, covered: true }, { name: 'password', required: true, covered: true }],
      responseProperties: [], testRefs: ['POST /auth/login'],
    },
    {
      path: '/api/v1/auth/logout', method: 'POST', covered: true, tags: ['auth'],
      statusCodes: { '204': { covered: true, testRefs: [] } },
      parameters: [{ name: 'Authorization', in: 'header', required: true, covered: true }],
      bodyProperties: [], responseProperties: [], testRefs: ['POST /auth/logout'],
    },
    {
      path: '/api/v1/auth/refresh', method: 'POST', covered: false, tags: ['auth'],
      statusCodes: { '200': { covered: false, testRefs: [] }, '401': { covered: false, testRefs: [] } },
      parameters: [],
      bodyProperties: [{ name: 'refreshToken', required: true, covered: false }],
      responseProperties: [], testRefs: [],
    },
  ],
  uncoveredOperations: [],
  unmatchedHits: [],
  tagCoverage: {
    users: {
      endpoints:          { total: 5, covered: 4, percentage: 80.0 },
      statusCodes:        { total: 14, covered: 10, percentage: 71.4 },
      parameters:         { total: 14, covered: 10, percentage: 71.4 },
      bodyProperties:     { total: 6, covered: 3, percentage: 50.0 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    },
    products: {
      endpoints:          { total: 4, covered: 3, percentage: 75.0 },
      statusCodes:        { total: 8, covered: 6, percentage: 75.0 },
      parameters:         { total: 8, covered: 5, percentage: 62.5 },
      bodyProperties:     { total: 4, covered: 4, percentage: 100 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    },
    auth: {
      endpoints:          { total: 3, covered: 2, percentage: 66.7 },
      statusCodes:        { total: 5, covered: 4, percentage: 80.0 },
      parameters:         { total: 1, covered: 1, percentage: 100 },
      bodyProperties:     { total: 5, covered: 4, percentage: 80.0 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    },
  },
};

const md = generateMarkdownReport(result, { title: 'Acme API — Coverage Report' });
const outPath = resolve(ROOT, 'demo-coverage.md');
await writeFile(outPath, md, 'utf8');
console.log(`Written to ${outPath}`);
