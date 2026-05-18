import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import PlayswagReporter from '../../src/reporter.js';
import { ATTACHMENT_NAME } from '../../src/constants.js';

vi.mock('../../src/openapi/parser.js', () => ({
  parseSpecs: vi.fn(),
}));

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
  });

  afterEach(() => {
    if (originalCI !== undefined) process.env['CI'] = originalCI;
    else delete process.env['CI'];
    vi.restoreAllMocks();
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
});
