import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isCoverageResult } from '../../src/utils/safe-json.js';

const outputDir = join(dirname(fileURLToPath(import.meta.url)), 'output');
const jsonPath = join(outputDir, 'playswag-coverage.json');

async function waitForCoverageReport(
  path: string,
  timeoutMs = 30_000,
  intervalMs = 100
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(path)) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(
    `Integration teardown: timed out waiting for coverage report at ${path} (reporter onEnd may not have run)`
  );
}

export default async function globalTeardown(): Promise<void> {
  await waitForCoverageReport(jsonPath);

  const data: unknown = JSON.parse(readFileSync(jsonPath, 'utf8'));
  if (!isCoverageResult(data)) {
    throw new Error('Integration teardown: playswag-coverage.json is not a valid CoverageResult');
  }
  if (data.summary.endpoints.covered < 1) {
    throw new Error('Integration teardown: expected at least one covered endpoint');
  }
  if (!data.operations.some((op) => op.testRefs.length > 0)) {
    throw new Error('Integration teardown: expected testRefs on at least one operation');
  }
}
