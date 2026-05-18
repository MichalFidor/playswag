#!/usr/bin/env node
/**
 * Runs after `playwright test` (integration) — reporter onEnd writes the JSON
 * only after Playwright exits globalTeardown, so validation must be post-run.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsonPath = join(root, 'tests/integration/output/playswag-coverage.json');

function fail(message) {
  console.error(`[integration] ${message}`);
  process.exit(1);
}

if (!existsSync(jsonPath)) {
  fail(`expected coverage report at ${jsonPath}`);
}

let data;
try {
  data = JSON.parse(readFileSync(jsonPath, 'utf8'));
} catch {
  fail('playswag-coverage.json is not valid JSON');
}

if (!data.summary?.endpoints || typeof data.summary.endpoints.covered !== 'number') {
  fail('playswag-coverage.json missing summary.endpoints');
}

if (data.summary.endpoints.covered < 1) {
  fail('expected at least one covered endpoint');
}

if (!Array.isArray(data.operations) || !data.operations.some((op) => op.testRefs?.length > 0)) {
  fail('expected testRefs on at least one operation');
}

console.log('[integration] Coverage report verified:', jsonPath);
