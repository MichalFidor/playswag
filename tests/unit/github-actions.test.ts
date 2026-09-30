import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  isGitHubActions,
  emitAnnotations,
  writeStepSummary,
  getPullRequestNumber,
  shouldPostPullRequestComment,
  writePullRequestComment,
  PR_COMMENT_MARKER,
  pullRequestCommentMarker,
} from '../../src/output/github-actions.js';
import type { CoverageResult } from '../../src/types.js';
import type { ThresholdViolation } from '../../src/output/console.js';
import type { CoverageDelta } from '../../src/output/history.js';

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-03-04T10:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.2.0',
    totalTestCount: 10,
    tagCoverage: {
      users: {
        endpoints:          { total: 3, covered: 3, percentage: 100 },
        statusCodes:        { total: 6, covered: 5, percentage: 83.3 },
        parameters:         { total: 2, covered: 2, percentage: 100 },
        bodyProperties:     { total: 1, covered: 1, percentage: 100 },
        responseProperties: { total: 1, covered: 1, percentage: 100 },
      },
    },
    summary: {
      endpoints:          { total: 4, covered: 3, percentage: 75 },
      statusCodes:        { total: 8, covered: 6, percentage: 75 },
      parameters:         { total: 4, covered: 2, percentage: 50 },
      bodyProperties:     { total: 3, covered: 2, percentage: 66.7 },
      responseProperties: { total: 3, covered: 2, percentage: 66.7 },
    },
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  } as CoverageResult;
}

// ─── isGitHubActions ─────────────────────────────────────────────────────────

describe('isGitHubActions', () => {
  const ORIG = process.env['GITHUB_ACTIONS'];

  afterEach(() => {
    if (ORIG === undefined) {
      delete process.env['GITHUB_ACTIONS'];
    } else {
      process.env['GITHUB_ACTIONS'] = ORIG;
    }
  });

  it('returns true when GITHUB_ACTIONS=true', () => {
    process.env['GITHUB_ACTIONS'] = 'true';
    expect(isGitHubActions()).toBe(true);
  });

  it('returns false when GITHUB_ACTIONS is unset', () => {
    delete process.env['GITHUB_ACTIONS'];
    expect(isGitHubActions()).toBe(false);
  });

  it('returns false when GITHUB_ACTIONS=false', () => {
    process.env['GITHUB_ACTIONS'] = 'false';
    expect(isGitHubActions()).toBe(false);
  });
});

// ─── emitAnnotations ─────────────────────────────────────────────────────────

describe('emitAnnotations', () => {
  let written = '';

  beforeEach(() => {
    written = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits ::error:: for fail violations', () => {
    const v: ThresholdViolation = { message: 'Endpoint coverage 70% below 80%', fail: true };
    emitAnnotations([v]);
    expect(written).toContain('::error::');
    expect(written).toContain('Endpoint coverage 70% below 80%');
  });

  it('emits ::warning:: for non-fail violations', () => {
    const v: ThresholdViolation = { message: 'Parameter coverage 40% below 50%', fail: false };
    emitAnnotations([v]);
    expect(written).toContain('::warning::');
  });

  it('emits nothing given an empty array', () => {
    emitAnnotations([]);
    expect(written).toBe('');
  });

  it('emits one line per violation', () => {
    const violations: ThresholdViolation[] = [
      { message: 'A', fail: true },
      { message: 'B', fail: false },
    ];
    emitAnnotations(violations);
    const lines = written.split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
  });
});

// ─── writeStepSummary ────────────────────────────────────────────────────────

describe('writeStepSummary', () => {
  let tmpDir: string;
  const ORIG = process.env['GITHUB_STEP_SUMMARY'];

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-ga-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (ORIG === undefined) {
      delete process.env['GITHUB_STEP_SUMMARY'];
    } else {
      process.env['GITHUB_STEP_SUMMARY'] = ORIG;
    }
  });

  it('does nothing when GITHUB_STEP_SUMMARY is not set', async () => {
    delete process.env['GITHUB_STEP_SUMMARY'];
    // Should not throw
    await expect(writeStepSummary(makeResult(), [])).resolves.toBeUndefined();
  });

  it('writes a markdown table to the summary file', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('## playswag');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Status Codes');
    expect(content).toContain('Parameters');
    expect(content).toContain('Body Properties');
  });

  it('separates multiple project summaries with a blank line', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    await writeStepSummary(makeResult(), [], { reportName: 'First' });
    await writeStepSummary(makeResult(), [], { reportName: 'Second' });
    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('\n\n## playswag — API Coverage Report · Second');
  });

  it('includes a tag coverage table when tags exist', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Coverage by Tag');
    expect(content).toContain('users');
  });

  it('includes violations section when violations are present', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const violations: ThresholdViolation[] = [
      { message: 'Endpoint coverage 70.0% is below threshold 80%', fail: true },
    ];
    await writeStepSummary(makeResult(), violations);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Threshold Violations');
    expect(content).toContain('Endpoint coverage');
    expect(content).toContain('❌');
  });

  it('does NOT include violations section when violations list is empty', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), []);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Threshold Violations');
  });

  it('uses warning emoji for non-fail violations', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const violations: ThresholdViolation[] = [
      { message: 'Parameter coverage warn', fail: false },
    ];
    await writeStepSummary(makeResult(), violations);
    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('⚠️');
  });

  it('skips tag table when tagCoverage only has (untagged)', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      tagCoverage: {
        '(untagged)': {
          endpoints:          { total: 2, covered: 1, percentage: 50 },
          statusCodes:        { total: 4, covered: 2, percentage: 50 },
          parameters:         { total: 0, covered: 0, percentage: 100 },
          bodyProperties:     { total: 0, covered: 0, percentage: 100 },
          responseProperties: { total: 0, covered: 0, percentage: 100 },
        },
      },
    });
    await writeStepSummary(result, []);
    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Coverage by Tag');
  });

  it('omits excluded dimensions from the summary table', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), [], {}, undefined, ['statusCodes', 'responseProperties']);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Parameters');
    expect(content).toContain('Body Properties');
    expect(content).not.toContain('Status Codes');
    expect(content).not.toContain('Response Properties');
  });

  it('shows delta indicators next to percentages when delta is provided', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const delta: CoverageDelta = {
      endpoints: 3.5,
      statusCodes: -2,
      parameters: 0,
      bodyProperties: 1,
      responseProperties: 0,
    };
    await writeStepSummary(makeResult(), [], {}, delta);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('↑3.5%');
    expect(content).toContain('↓2.0%');
    // zero delta suppressed
    expect(content).not.toContain('↑0');
    expect(content).not.toContain('↓0');
  });

  it('includes collapsible uncovered operations when showUncoveredOperations is true', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const result = makeResult({
      uncoveredOperations: [
        { path: '/api/widgets', method: 'get', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
        { path: '/api/widgets/{id}', method: 'delete', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
      ],
    });
    await writeStepSummary(result, [], { showUncoveredOperations: true });

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('<details>');
    expect(content).toContain('Uncovered operations (2)');
    expect(content).toContain('/api/widgets');
    expect(content).toContain('DELETE');
  });

  it('does not include uncovered operations section when showUncoveredOperations is false', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    const result = makeResult({
      uncoveredOperations: [
        { path: '/api/widgets', method: 'get', covered: false, statusCodes: {}, parameters: [], bodyProperties: [], responseProperties: [], testRefs: [] },
      ],
    });
    await writeStepSummary(result, [], { showUncoveredOperations: false });

    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('<details>');
    expect(content).not.toContain('Uncovered operations');
  });

  it('omits excluded dimensions from the tag coverage table columns', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;

    await writeStepSummary(makeResult(), [], {}, undefined, ['parameters', 'bodyProperties', 'responseProperties']);

    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Endpoints');
    expect(content).toContain('Status Codes');
    // excluded dimensions must not appear in tag table header
    expect(content).not.toContain('Parameters');
    expect(content).not.toContain('Body Props');
    expect(content).not.toContain('Resp Props');
  });

  it('does NOT include unmatched hits when showUnmatchedHits is false (default)', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      unmatchedHits: [{ method: 'GET', url: 'http://api.example.com/unknown', statusCode: 404, testTitle: 't', testFile: 'f.spec.ts' }],
    });
    await writeStepSummary(result, [], {});
    const content = await readFile(summaryPath, 'utf8');
    expect(content).not.toContain('Unmatched API calls');
  });

  it('includes collapsible unmatched hits when showUnmatchedHits is true', async () => {
    const summaryPath = join(tmpDir, 'summary.md');
    process.env['GITHUB_STEP_SUMMARY'] = summaryPath;
    const result = makeResult({
      unmatchedHits: [
        { method: 'GET', url: 'http://api.example.com/unknown', statusCode: 404, testTitle: 't', testFile: 'f.spec.ts' },
        { method: 'POST', url: 'http://api.example.com/other', statusCode: 500, testTitle: 't2', testFile: 'f.spec.ts' },
      ],
    });
    await writeStepSummary(result, [], { showUnmatchedHits: true });
    const content = await readFile(summaryPath, 'utf8');
    expect(content).toContain('Unmatched API calls (2)');
    expect(content).toContain('`GET`');
    expect(content).toContain('`http://api.example.com/unknown`');
    expect(content).toContain('404');
    expect(content).toContain('<details>');
  });
});

// ─── getPullRequestNumber ────────────────────────────────────────────────────

describe('getPullRequestNumber', () => {
  let tmpDir: string;
  const ORIG_EVENT = process.env['GITHUB_EVENT_PATH'];

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-ga-event-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    if (ORIG_EVENT === undefined) {
      delete process.env['GITHUB_EVENT_PATH'];
    } else {
      process.env['GITHUB_EVENT_PATH'] = ORIG_EVENT;
    }
  });

  it('returns pull_request.number from the event payload', async () => {
    const eventPath = join(tmpDir, 'event.json');
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 42 } }), 'utf8');
    process.env['GITHUB_EVENT_PATH'] = eventPath;
    expect(await getPullRequestNumber()).toBe(42);
  });

  it('returns undefined when GITHUB_EVENT_PATH is unset', async () => {
    delete process.env['GITHUB_EVENT_PATH'];
    expect(await getPullRequestNumber()).toBeUndefined();
  });
});

// ─── shouldPostPullRequestComment ────────────────────────────────────────────

describe('shouldPostPullRequestComment', () => {
  const ORIG_EVENT = process.env['GITHUB_EVENT_PATH'];
  const ORIG_EVENT_NAME = process.env['GITHUB_EVENT_NAME'];

  afterEach(() => {
    if (ORIG_EVENT === undefined) delete process.env['GITHUB_EVENT_PATH'];
    else process.env['GITHUB_EVENT_PATH'] = ORIG_EVENT;
    if (ORIG_EVENT_NAME === undefined) delete process.env['GITHUB_EVENT_NAME'];
    else process.env['GITHUB_EVENT_NAME'] = ORIG_EVENT_NAME;
  });

  it('returns false when explicitly disabled', async () => {
    expect(await shouldPostPullRequestComment({ postPullRequestComment: false })).toBe(false);
  });

  it('returns true when explicitly enabled', async () => {
    expect(await shouldPostPullRequestComment({ postPullRequestComment: true })).toBe(true);
  });

  it('returns false on non-pull_request events by default', async () => {
    process.env['GITHUB_EVENT_NAME'] = 'push';
    delete process.env['GITHUB_EVENT_PATH'];
    expect(await shouldPostPullRequestComment({})).toBe(false);
  });
});

// ─── writePullRequestComment ─────────────────────────────────────────────────

describe('writePullRequestComment', () => {
  let tmpDir: string;
  const envKeys = [
    'GITHUB_EVENT_PATH',
    'GITHUB_EVENT_NAME',
    'GITHUB_TOKEN',
    'GITHUB_REPOSITORY',
    'GITHUB_API_URL',
    'GITHUB_SERVER_URL',
    'GITHUB_RUN_ID',
  ] as const;
  const ORIG: Record<string, string | undefined> = {};

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-ga-pr-'));
    for (const key of envKeys) ORIG[key] = process.env[key];
    const eventPath = join(tmpDir, 'event.json');
    await writeFile(eventPath, JSON.stringify({ pull_request: { number: 7 } }), 'utf8');
    process.env['GITHUB_EVENT_PATH'] = eventPath;
    process.env['GITHUB_EVENT_NAME'] = 'pull_request';
    process.env['GITHUB_TOKEN'] = 'test-token';
    process.env['GITHUB_REPOSITORY'] = 'owner/repo';
    process.env['GITHUB_API_URL'] = 'https://api.example.com';
    process.env['GITHUB_SERVER_URL'] = 'https://github.com';
    process.env['GITHUB_RUN_ID'] = '12345';
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
    for (const key of envKeys) {
      if (ORIG[key] === undefined) delete process.env[key];
      else process.env[key] = ORIG[key];
    }
  });

  it('creates a new PR comment when none exists', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 99 }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await writePullRequestComment(makeResult(), []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const createCall = fetchMock.mock.calls[1];
    expect(createCall[0]).toBe('https://api.example.com/repos/owner/repo/issues/7/comments');
    expect(createCall[1]?.method).toBe('POST');
    const body = JSON.parse(String(createCall[1]?.body));
    expect(body.body).toContain(PR_COMMENT_MARKER);
    expect(body.body).toContain('playswag — API Coverage Report');
    expect(body.body).toContain('View workflow run');
  });

  it('updates an existing PR comment when the marker is present', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 55, body: `old report\n${PR_COMMENT_MARKER}`, user: { login: 'github-actions[bot]' } }],
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 55 }),
      });
    vi.stubGlobal('fetch', fetchMock);

    await writePullRequestComment(makeResult(), []);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const patchCall = fetchMock.mock.calls[1];
    expect(patchCall[0]).toBe('https://api.example.com/repos/owner/repo/issues/comments/55');
    expect(patchCall[1]?.method).toBe('PATCH');
  });

  it('does nothing when postPullRequestComment is false', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await writePullRequestComment(makeResult(), [], { postPullRequestComment: false });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps project comments separate and ignores markers owned by other authors', async () => {
    const a = pullRequestCommentMarker('a');
    const b = pullRequestCommentMarker('b');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [
        { id: 1, body: a, user: { login: 'github-actions[bot]' } },
        { id: 2, body: b, user: { login: 'someone-else' } },
      ] })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), [], { commentKey: 'b', reportName: 'Project B' });
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    const posted = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { body: string };
    expect(posted.body).toContain(b);
    expect(posted.body).not.toContain(a);
    expect(posted.body).toContain('Project B');
  });

  it('finds an owned report past the first 100 comments', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => Array.from({ length: 100 }, (_, id) => ({ id: id + 1, body: 'unrelated' })) })
      .mockResolvedValueOnce({ ok: true, json: async () => [{ id: 101, body: PR_COMMENT_MARKER, user: { login: 'github-actions[bot]' } }] })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), []);
    expect(fetchMock.mock.calls[1]?.[0]).toContain('&page=2');
    expect(fetchMock.mock.calls[2]?.[0]).toContain('/comments/101');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PATCH');
  });

  it('aborts a stalled request within the configured deadline', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    }));
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), [], { timeoutMs: 10 });
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('aborts unread error responses and never starts a write after a failed list', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), []);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).signal?.aborted).toBe(true);
    warn.mockRestore();
  });

  it('keeps the deadline active while reading the comments response body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn((_url: string, init: RequestInit) => Promise.resolve({
      ok: true,
      json: () => new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('body aborted')), { once: true });
      }),
    }));
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), [], { timeoutMs: 10 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('rejects timeout values that would overflow Node timers', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), [], { timeoutMs: 2_147_483_648 });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('limits a large comment and preserves its update marker', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await writePullRequestComment(makeResult(), [], { reportName: 'x'.repeat(70_000) });
    const posted = JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)) as { body: string };
    expect(posted.body.length).toBeLessThan(65_536);
    expect(posted.body).toContain(PR_COMMENT_MARKER);
    expect(posted.body).toContain('Report truncated');
  });
});
