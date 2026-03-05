/**
 * E2E runner for all configuration examples.
 *
 * Each test spawns a separate `playwright test` process with a dedicated
 * configuration file, then asserts the exit code and/or output files.
 *
 * Tests run sequentially (single vitest worker) because they all listen on
 * port 3457.  See vitest.examples.config.ts for the pool/concurrency settings.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverageResult } from '../../src/types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '../..');
const CONFIGS_DIR = resolve(__dirname, 'configs');
const OUTPUT_DIR = resolve(__dirname, 'output');
const PLAYWRIGHT_BIN = join(ROOT_DIR, 'node_modules', '.bin', 'playwright');

function run(configFile: string): { exitCode: number; stdout: string; stderr: string } {
  const result = spawnSync(
    PLAYWRIGHT_BIN,
    ['test', '--config', join(CONFIGS_DIR, configFile)],
    {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      timeout: 60_000,
      env: { ...process.env, CI: '1' },
    }
  );
  return {
    exitCode: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function output(scenario: string, fileName = 'playswag-coverage.json'): string {
  return resolve(OUTPUT_DIR, scenario, fileName);
}

function readReport(scenario: string, fileName = 'playswag-coverage.json'): CoverageResult {
  return JSON.parse(readFileSync(output(scenario, fileName), 'utf8')) as CoverageResult;
}

beforeAll(() => {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
});

describe('output formats', () => {
  it('all five output files are created when all formats are enabled', { timeout: 60_000 }, () => {
    const { exitCode } = run('output-formats.config.ts');
    expect(exitCode).toBe(0);

    expect(existsSync(output('output-formats', 'playswag-coverage.json'))).toBe(true);
    expect(existsSync(output('output-formats', 'playswag-coverage.html'))).toBe(true);
    expect(existsSync(output('output-formats', 'playswag-badge.svg'))).toBe(true);
    expect(existsSync(output('output-formats', 'playswag-junit.xml'))).toBe(true);
  });
});

describe('JSON options', () => {
  it('writes to a custom fileName with pretty: false (minified)', { timeout: 60_000 }, () => {
    const { exitCode } = run('json-options.config.ts');
    expect(exitCode).toBe(0);

    const filePath = output('json-options', 'custom.json');
    expect(existsSync(filePath)).toBe(true);

    const raw = readFileSync(filePath, 'utf8');
    expect(raw.includes('\n')).toBe(false);
  });
});

describe('HTML options', () => {
  it('writes to custom fileName and injects the custom title', { timeout: 60_000 }, () => {
    const { exitCode } = run('html-options.config.ts');
    expect(exitCode).toBe(0);

    const filePath = output('html-options', 'my-report.html');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toContain('My Custom Title');
  });
});

describe('badge options', () => {
  it('writes to custom fileName and embeds the custom label', { timeout: 60_000 }, () => {
    const { exitCode } = run('badge-options.config.ts');
    expect(exitCode).toBe(0);

    const filePath = output('badge-options', 'status-badge.svg');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toContain('Status Coverage');
  });
});

describe('JUnit options', () => {
  it('writes to custom fileName with valid JUnit XML', { timeout: 60_000 }, () => {
    const { exitCode } = run('junit-options.config.ts');
    expect(exitCode).toBe(0);

    const filePath = output('junit-options', 'ci-report.xml');
    expect(existsSync(filePath)).toBe(true);
    expect(readFileSync(filePath, 'utf8')).toContain('<testsuite');
  });
});

describe('thresholds', () => {
  it('exits 0 when all thresholds are satisfied', { timeout: 60_000 }, () => {
    const { exitCode } = run('thresholds-pass.config.ts');
    expect(exitCode).toBe(0);
  });

  it('exits 1 when a threshold is violated and failOnThreshold is true', { timeout: 60_000 }, () => {
    const { exitCode } = run('thresholds-fail.config.ts');
    expect(exitCode).toBe(1);
  });

  it('per-dimension { min, fail } entries are honoured — exits 0', { timeout: 60_000 }, () => {
    const { exitCode } = run('thresholds-per-dimension.config.ts');
    expect(exitCode).toBe(0);

    const report = readReport('thresholds-per-dimension');
    expect(report.summary.endpoints.percentage).toBeGreaterThan(80);
  });
});

describe('filter patterns', () => {
  it('includePatterns: only the matched path is counted as covered', { timeout: 60_000 }, () => {
    const { exitCode } = run('filter-include.config.ts');
    expect(exitCode).toBe(0);

    const report = readReport('filter-include');
    expect(report.summary.endpoints.covered).toBe(1);
  });

  it('excludePatterns: the excluded path remains uncovered in the report', { timeout: 60_000 }, () => {
    const { exitCode } = run('filter-exclude.config.ts');
    expect(exitCode).toBe(0);

    const report = readReport('filter-exclude');

    const healthOp = report.operations.find(
      (op) => op.method === 'GET' && op.path === '/api/health'
    );
    expect(healthOp?.covered).toBe(false);
    expect(report.summary.endpoints.covered).toBe(4);
  });
});

describe('console options', () => {
  it('all showXxx options enabled — exits 0 without throwing', { timeout: 60_000 }, () => {
    const { exitCode } = run('console-options.config.ts');
    expect(exitCode).toBe(0);
  });
});

describe('history options', () => {
  it('creates the history file with one entry after first run', { timeout: 60_000 }, () => {
    const { exitCode } = run('history-options.config.ts');
    expect(exitCode).toBe(0);

    const historyPath = output('history-options', 'coverage-history.json');
    expect(existsSync(historyPath)).toBe(true);

    const history = JSON.parse(readFileSync(historyPath, 'utf8')) as unknown[];
    expect(Array.isArray(history)).toBe(true);
    expect(history.length).toBe(1);
  });
});

describe('fixture options', () => {
  it('playswagEnabled:false excludes those tests from coverage', { timeout: 60_000 }, () => {
    const { exitCode } = run('fixture-options.config.ts');
    expect(exitCode).toBe(0);

    const report = readReport('fixture-options');
    expect(report.summary.endpoints.covered).toBe(2);

    const usersListOp = report.operations.find(
      (op) => op.method === 'GET' && op.path === '/api/users'
    );
    expect(usersListOp?.covered).toBe(false);

    const postUsersOp = report.operations.find(
      (op) => op.method === 'POST' && op.path === '/api/users'
    );
    expect(postUsersOp?.covered).toBe(false);
  });

  it('captureResponseBody:false: hit recorded but response props not covered', { timeout: 60_000 }, () => {
    const report = readReport('fixture-options');

    const getUserOp = report.operations.find(
      (op) => op.method === 'GET' && op.path === '/api/users/{id}'
    );
    expect(getUserOp?.covered).toBe(true);
    const coveredRespProps = getUserOp?.responseProperties.filter((p) => p.covered) ?? [];
    expect(coveredRespProps.length).toBe(0);
  });
});

describe('multi-project', () => {
  it('each project gets isolated coverage against its own spec', { timeout: 60_000 }, () => {
    const { exitCode } = run('multi-project.config.ts');
    expect(exitCode).toBe(0);

    const usersReport = readReport('multi-project/users-service');
    const healthReport = readReport('multi-project/health-service');

    expect(usersReport.summary.endpoints.total).toBe(4);
    expect(usersReport.operations.every((op) => op.path !== '/api/health')).toBe(true);

    expect(healthReport.summary.endpoints.total).toBe(1);
    expect(healthReport.operations[0]?.path).toBe('/api/health');
    expect(healthReport.operations.every((op) => !op.path.startsWith('/api/users'))).toBe(true);
  });
});
