import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import PlayswagReporter from '../../src/reporter.js';
import { ATTACHMENT_NAME } from '../../src/constants.js';

vi.mock('../../src/openapi/parser.js', () => ({
  parseSpecs: vi.fn(),
}));

vi.mock('../../src/output/github-actions.js', () => ({
  isGitHubActions: vi.fn(() => false),
  writePullRequestComment: vi.fn(),
  writeStepSummary: vi.fn(),
  emitAnnotations: vi.fn(),
}));

import { isGitHubActions, writePullRequestComment } from '../../src/output/github-actions.js';
import { parseSpecs } from '../../src/openapi/parser.js';

const mockedParseSpecs = vi.mocked(parseSpecs);

function makeTestCase() {
  return {
    title: 'hits api',
    location: { file: '/tests/api.spec.ts', line: 1, column: 1 },
    parent: {
      project: () => ({ name: 'default', use: { baseURL: 'http://localhost:3456' } }),
    },
  } as never;
}

function makeHit() {
  return {
    method: 'GET',
    url: 'http://localhost:3456/api/users',
    statusCode: 200,
    testFile: '/tests/api.spec.ts',
    testTitle: 'hits api',
  };
}

describe('PlayswagReporter onEnd', () => {
  let outputDir: string;
  let originalCI: string | undefined;

  beforeEach(() => {
    outputDir = mkdtempSync(join(tmpdir(), 'playswag-reporter-'));
    originalCI = process.env['CI'];
    process.env['CI'] = 'true';
    mockedParseSpecs.mockReset();
    vi.mocked(isGitHubActions).mockReturnValue(false);
    vi.mocked(writePullRequestComment).mockClear();
  });

  afterEach(() => {
    if (originalCI !== undefined) process.env['CI'] = originalCI;
    else delete process.env['CI'];
    delete process.env['PLAYSWAG_DISABLED'];
    vi.restoreAllMocks();
    rmSync(outputDir, { recursive: true, force: true });
  });

  it('skips coverage when PLAYSWAG_DISABLED is set', async () => {
    process.env['PLAYSWAG_DISABLED'] = '1';

    const reporter = new PlayswagReporter({
      specs: './openapi.yaml',
      outputDir,
      outputFormats: ['json'],
    });

    reporter.onTestEnd(
      makeTestCase(),
      {
        attachments: [{
          name: ATTACHMENT_NAME,
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify([makeHit()])),
        }],
      } as never
    );

    const result = await reporter.onEnd({ status: 'passed' } as never);
    expect(result).toBeUndefined();
    expect(mockedParseSpecs).not.toHaveBeenCalled();
    expect(existsSync(join(outputDir, 'playswag-coverage.json'))).toBe(false);
  });

  it('fails run when spec parsing fails and failOnSpecError (default in CI)', async () => {
    mockedParseSpecs.mockRejectedValue(new Error('ENOENT'));

    const reporter = new PlayswagReporter({
      specs: './missing.yaml',
      outputDir,
      outputFormats: ['json'],
    });

    reporter.onBegin({ projects: [{ name: 'default', use: { baseURL: 'http://localhost:3456' } }] } as never, {} as never);
    reporter.onTestEnd(
      makeTestCase(),
      {
        attachments: [{
          name: ATTACHMENT_NAME,
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify([makeHit()])),
        }],
      } as never
    );

    const result = await reporter.onEnd({ status: 'passed' } as never);
    expect(result).toEqual({ status: 'failed' });
  });

  it('writes JSON and passes when spec parses', async () => {
    mockedParseSpecs.mockResolvedValue({
      sources: ['./openapi.yaml'],
      operations: [{
        method: 'GET',
        pathTemplate: '/api/users',
        parameters: [],
        responses: { '200': { description: 'ok' } },
      }],
    });

    const reporter = new PlayswagReporter({
      specs: './openapi.yaml',
      outputDir,
      outputFormats: ['json'],
    });

    reporter.onBegin({ projects: [] } as never, {} as never);
    reporter.onTestEnd(
      makeTestCase(),
      {
        attachments: [{
          name: ATTACHMENT_NAME,
          contentType: 'application/json',
          body: Buffer.from(JSON.stringify([makeHit()])),
        }],
      } as never
    );

    const result = await reporter.onEnd({ status: 'passed' } as never);
    expect(result).toBeUndefined();

    const jsonPath = join(outputDir, 'playswag-coverage.json');
    expect(existsSync(jsonPath)).toBe(true);
    const data = JSON.parse(readFileSync(jsonPath, 'utf8')) as { summary: { endpoints: { covered: number } } };
    expect(data.summary.endpoints.covered).toBeGreaterThanOrEqual(1);
  });

  it('evaluates a configured project even when it has no hit attachments', async () => {
    mockedParseSpecs.mockResolvedValue({ sources: ['spec.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: { '200': {} } },
    ] });
    const reporter = new PlayswagReporter({
      specs: 'global.yaml', outputDir, outputFormats: ['json'], history: { enabled: false },
      threshold: { endpoints: 100 }, failOnThreshold: true,
    });
    reporter.onBegin({ projects: [
      { name: 'a', use: { playswagSpecs: 'a.yaml' } },
      { name: 'b', use: { playswagSpecs: 'b.yaml' } },
    ] } as never, {} as never);
    reporter.onTestEnd({
      title: 'covers a', location: { file: 'a.spec.ts' },
      parent: { project: () => ({ name: 'a', use: { playswagSpecs: 'a.yaml' } }) },
    } as never, { attachments: [{ name: ATTACHMENT_NAME, body: Buffer.from(JSON.stringify([makeHit()])) }] } as never);
    expect(await reporter.onEnd({ status: 'passed' } as never)).toEqual({ status: 'failed' });
    const empty = JSON.parse(readFileSync(join(outputDir, 'b', 'playswag-coverage.json'), 'utf8'));
    expect(empty.summary.endpoints).toEqual({ total: 1, covered: 0, percentage: 0 });
    expect(mockedParseSpecs).toHaveBeenCalledTimes(2);
  });

  it('evaluates an empty global group alongside a project override', async () => {
    mockedParseSpecs.mockResolvedValue({ sources: ['spec.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: { '200': {} } },
    ] });
    const reporter = new PlayswagReporter({ specs: 'global.yaml', outputDir, outputFormats: ['json'], threshold: { endpoints: 100 }, failOnThreshold: true });
    reporter.onBegin({ projects: [
      { name: 'a', use: { playswagSpecs: 'a.yaml' } },
      { name: 'global-service', use: {} },
      { name: 'disabled', use: { playswagSpecs: 'disabled.yaml', playswagEnabled: false } },
    ] } as never, {} as never);
    expect(await reporter.onEnd({ status: 'passed' } as never)).toEqual({ status: 'failed' });
    expect(mockedParseSpecs.mock.calls.map(call => call[0])).toEqual(['a.yaml', 'global.yaml']);
    expect(existsSync(join(outputDir, 'playswag-coverage.json'))).toBe(true);
  });

  it('skips global coverage when all selected projects disable playswag', async () => {
    const disabled = { name: 'disabled', use: { playswagEnabled: false } };
    const reporter = new PlayswagReporter({ specs: 'global.yaml', outputDir, outputFormats: ['json'], failOnThreshold: true, threshold: { endpoints: 100 } });
    reporter.onBegin({ projects: [disabled, { name: 'unselected', use: { playswagSpecs: 'unused.yaml' } }] } as never, {
      suites: [{ project: () => disabled }],
    } as never);
    expect(await reporter.onEnd({ status: 'passed' } as never)).toBeUndefined();
    expect(mockedParseSpecs).not.toHaveBeenCalled();
    expect(readdirSync(outputDir)).toEqual([]);
  });

  it('preserves reports for unnamed, unsafe, reserved and case-colliding project names', async () => {
    const names = ['', 'default', '.', '..', 'project', 'A', 'a', '../outside', 'a/b', 'a\\b', 'CON'];
    mockedParseSpecs.mockImplementation(async (input) => ({ sources: [String(input)], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: { '200': {} } },
    ] }));
    const reporter = new PlayswagReporter({ specs: 'unused-global.yaml', outputDir, outputFormats: ['json'], history: { enabled: false } });
    reporter.onBegin({ projects: names.map((name, index) => ({ name, use: { playswagSpecs: `spec-${index}.yaml` } })) } as never, {} as never);
    expect(await reporter.onEnd({ status: 'passed' } as never)).toBeUndefined();
    const directories = readdirSync(outputDir);
    expect(directories).toHaveLength(names.length);
    expect(new Set(directories.map((directory) => directory.toLowerCase())).size).toBe(names.length);
    const specs = directories.map((directory) => {
      expect(directory).not.toMatch(/^(?:\.\.?|con|prn|aux|nul)$/i);
      return (JSON.parse(readFileSync(join(outputDir, directory, 'playswag-coverage.json'), 'utf8')) as { specFiles: string[] }).specFiles[0];
    });
    expect(specs.sort()).toEqual(names.map((_, index) => `spec-${index}.yaml`).sort());
  });

  it('keeps global, project named global, unnamed and default project comments distinct', async () => {
    vi.mocked(isGitHubActions).mockReturnValue(true);
    mockedParseSpecs.mockResolvedValue({ sources: ['spec.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: { '200': {} } },
    ] });
    const reporter = new PlayswagReporter({ specs: 'global.yaml', outputDir, outputFormats: [], history: { enabled: false } });
    reporter.onBegin({ projects: [
      { name: 'global', use: { playswagSpecs: 'project-global.yaml' } },
      { name: '', use: { playswagSpecs: 'unnamed.yaml' } },
      { name: 'default', use: { playswagSpecs: 'default.yaml' } },
      { name: 'uses-global', use: {} },
    ] } as never, {} as never);
    await reporter.onEnd({ status: 'passed' } as never);
    const commentKeys = vi.mocked(writePullRequestComment).mock.calls.map((call) => call[2]?.commentKey);
    expect(commentKeys).toHaveLength(4);
    expect(new Set(commentKeys).size).toBe(4);
  });

  it('continues other groups after one spec fails, and retains the failing run status', async () => {
    mockedParseSpecs.mockRejectedValueOnce(new Error('invalid schema')).mockResolvedValue({ sources: ['ok.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: { '200': {} } },
    ] });
    const reporter = new PlayswagReporter({ specs: 'unused-global.yaml', outputDir, outputFormats: ['json'], history: { enabled: false }, failOnSpecError: true });
    reporter.onBegin({ projects: [
      { name: 'broken', use: { playswagSpecs: 'broken.yaml' } },
      { name: 'valid', use: { playswagSpecs: 'valid.yaml' } },
    ] } as never, {} as never);
    expect(await reporter.onEnd({ status: 'passed' } as never)).toEqual({ status: 'failed' });
    expect(mockedParseSpecs).toHaveBeenCalledTimes(2);
    expect(existsSync(join(outputDir, 'valid', 'playswag-coverage.json'))).toBe(true);
  });

  it('fails on an empty operation set after tag filtering', async () => {
    mockedParseSpecs.mockResolvedValue({ sources: ['spec.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', tags: ['users'], parameters: [], responses: {} },
    ] });
    const reporter = new PlayswagReporter({ specs: 'global.yaml', outputDir, outputFormats: [], includeTags: ['typo'], failOnSpecError: true });
    expect(await reporter.onEnd({ status: 'passed' } as never)).toEqual({ status: 'failed' });
  });

  it('rejects valid JSON with an invalid hit structure without crashing', async () => {
    mockedParseSpecs.mockResolvedValue({ sources: ['spec.yaml'], operations: [
      { method: 'GET', pathTemplate: '/api/users', parameters: [], responses: {} },
    ] });
    const reporter = new PlayswagReporter({ specs: 'spec.yaml', outputDir, outputFormats: [], failOnSpecError: true });
    expect(() => reporter.onTestEnd(makeTestCase(), { attachments: [{ name: ATTACHMENT_NAME, body: Buffer.from('{}') }] } as never)).not.toThrow();
    expect(await reporter.onEnd({ status: 'passed' } as never)).toEqual({ status: 'failed' });
  });
});
