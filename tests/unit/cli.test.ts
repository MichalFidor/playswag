import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CoverageResult } from '../../src/types.js';

const execFileAsync = promisify(execFile);
const CLI_PATH = join(import.meta.dirname, '../../src/cli.ts');

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-01-01T00:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.0.0',
    totalTestCount: 5,
    summary: {
      endpoints: { total: 2, covered: 1, percentage: 50 },
      statusCodes: { total: 4, covered: 2, percentage: 50 },
      parameters: { total: 2, covered: 1, percentage: 50 },
      bodyProperties: { total: 0, covered: 0, percentage: 100 },
      responseProperties: { total: 0, covered: 0, percentage: 100 },
    },
    tagCoverage: {},
    operations: [
      {
        path: '/users',
        method: 'GET',
        covered: true,
        statusCodes: { '200': { covered: true, testRefs: ['test-a'] } },
        parameters: [{ name: 'q', in: 'query' as const, required: false, covered: true }],
        bodyProperties: [],
        responseProperties: [],
        testRefs: ['test-a'],
      },
    ],
    uncoveredOperations: [
      {
        path: '/posts',
        method: 'GET',
        covered: false,
        statusCodes: { '200': { covered: false, testRefs: [] } },
        parameters: [{ name: 'limit', in: 'query' as const, required: false, covered: false }],
        bodyProperties: [],
        responseProperties: [],
        testRefs: [],
      },
    ],
    unmatchedHits: [],
    acknowledgedHits: [],
    ...overrides,
  };
}

async function runCli(args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      'npx',
      ['tsx', CLI_PATH, ...args],
      { cwd: join(import.meta.dirname, '../..') }
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const e = err as { stdout: string; stderr: string; code: number };
    return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', code: e.code ?? 1 };
  }
}

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'playswag-cli-test-'));
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('CLI merge command', () => {
  it('shows help with --help flag', async () => {
    const { stdout, code } = await runCli(['--help']);
    expect(code).toBe(0);
    expect(stdout).toContain('Usage: playswag merge');
  });

  it('fails with unknown command', async () => {
    const { stderr, code } = await runCli(['unknown']);
    expect(code).toBe(1);
    expect(stderr).toContain('Unknown command');
  });

  it('fails when fewer than 2 files are provided', async () => {
    const file = join(tmpDir, 'one.json');
    await writeFile(file, JSON.stringify(makeResult()), 'utf8');

    const { stderr, code } = await runCli(['merge', file]);
    expect(code).toBe(1);
    expect(stderr).toContain('at least 2');
  });

  it('merges two JSON reports into a combined file', async () => {
    const file1 = join(tmpDir, 'shard1.json');
    const file2 = join(tmpDir, 'shard2.json');
    const output = join(tmpDir, 'merged.json');

    await writeFile(file1, JSON.stringify(makeResult({ totalTestCount: 10 })), 'utf8');
    await writeFile(
      file2,
      JSON.stringify(
        makeResult({
          totalTestCount: 8,
          operations: [
            {
              path: '/posts',
              method: 'GET',
              covered: true,
              statusCodes: { '200': { covered: true, testRefs: ['test-b'] } },
              parameters: [{ name: 'limit', in: 'query' as const, required: false, covered: true }],
              bodyProperties: [],
              responseProperties: [],
              testRefs: ['test-b'],
            },
          ],
          uncoveredOperations: [],
        })
      ),
      'utf8'
    );

    const { stdout, code } = await runCli(['merge', file1, file2, '-o', output]);
    expect(code).toBe(0);
    expect(stdout).toContain('Merged 2 reports');

    const merged = JSON.parse(await readFile(output, 'utf8')) as CoverageResult;
    expect(merged.totalTestCount).toBe(18);
    expect(merged.operations).toHaveLength(2);
    expect(merged.summary.endpoints.covered).toBe(2);
  });

  it('fails gracefully when a file does not exist', async () => {
    const file1 = join(tmpDir, 'exists.json');
    await writeFile(file1, JSON.stringify(makeResult()), 'utf8');

    const { stderr, code } = await runCli(['merge', file1, '/nonexistent.json']);
    expect(code).toBe(1);
    expect(stderr).toContain('Failed to read');
  });

  it('prints console summary with --console flag', async () => {
    const file1 = join(tmpDir, 'a.json');
    const file2 = join(tmpDir, 'b.json');
    const output = join(tmpDir, 'out.json');

    await writeFile(file1, JSON.stringify(makeResult()), 'utf8');
    await writeFile(file2, JSON.stringify(makeResult()), 'utf8');

    const { stdout, code } = await runCli(['merge', file1, file2, '-o', output, '--console']);
    expect(code).toBe(0);
    expect(stdout).toContain('Endpoints');
    expect(stdout).toContain('Status Codes');
  });

  it('writes HTML report with --html flag', async () => {
    const file1 = join(tmpDir, 'a.json');
    const file2 = join(tmpDir, 'b.json');
    const output = join(tmpDir, 'out.json');

    await writeFile(file1, JSON.stringify(makeResult()), 'utf8');
    await writeFile(file2, JSON.stringify(makeResult()), 'utf8');

    const { stdout, code } = await runCli(['merge', file1, file2, '-o', output, '--html']);
    expect(code).toBe(0);
    expect(stdout).toContain('HTML report');

    const htmlPath = join(tmpDir, 'playswag-coverage.html');
    const html = await readFile(htmlPath, 'utf8');
    expect(html).toContain('playswag');
  });

  it('writes badge with --badge flag', async () => {
    const file1 = join(tmpDir, 'a.json');
    const file2 = join(tmpDir, 'b.json');
    const output = join(tmpDir, 'out.json');

    await writeFile(file1, JSON.stringify(makeResult()), 'utf8');
    await writeFile(file2, JSON.stringify(makeResult()), 'utf8');

    const { stdout, code } = await runCli(['merge', file1, file2, '-o', output, '--badge']);
    expect(code).toBe(0);
    expect(stdout).toContain('Badge');

    const badgePath = join(tmpDir, 'playswag-badge.svg');
    const svg = await readFile(badgePath, 'utf8');
    expect(svg).toContain('<svg');
  });

  it('writes markdown report with --markdown flag', async () => {
    const file1 = join(tmpDir, 'a.json');
    const file2 = join(tmpDir, 'b.json');
    const output = join(tmpDir, 'out.json');

    await writeFile(file1, JSON.stringify(makeResult()), 'utf8');
    await writeFile(file2, JSON.stringify(makeResult()), 'utf8');

    const { stdout, code } = await runCli(['merge', file1, file2, '-o', output, '--markdown']);
    expect(code).toBe(0);
    expect(stdout).toContain('Markdown report');

    const mdPath = join(tmpDir, 'playswag-coverage.md');
    const md = await readFile(mdPath, 'utf8');
    expect(md).toContain('Endpoints');
  });
});
