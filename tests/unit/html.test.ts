import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateHtmlReport, writeHtmlReport } from '../../src/output/html.js';
import type { CoverageResult, OperationCoverage } from '../../src/types.js';
import type { HistoryEntry } from '../../src/output/history.js';

function makeOperation(overrides: Partial<OperationCoverage> = {}): OperationCoverage {
  return {
    path: '/api/users',
    method: 'GET',
    covered: true,
    statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: false, testRefs: [] } },
    parameters: [
      { name: 'limit', in: 'query', required: false, covered: true },
    ],
    bodyProperties: [],
    responseProperties: [],
    testRefs: ['GET /api/users — returns list'],
    tags: ['users'],
    ...overrides,
  };
}

function makeResult(overrides: Partial<CoverageResult> = {}): CoverageResult {
  return {
    specFiles: ['./openapi.yaml'],
    timestamp: '2025-06-01T12:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.1.0',
    totalTestCount: 8,
    summary: {
      endpoints: { total: 4, covered: 3, percentage: 75 },
      statusCodes: { total: 8, covered: 6, percentage: 75 },
      parameters: { total: 4, covered: 2, percentage: 50 },
      bodyProperties: { total: 2, covered: 2, percentage: 100 },
      responseProperties: { total: 2, covered: 1, percentage: 50 },
    },
    operations: [makeOperation()],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  };
}

describe('generateHtmlReport', () => {
  it('returns a string starting with <!DOCTYPE html', () => {
    const html = generateHtmlReport(makeResult());
    expect(html.trimStart()).toMatch(/^<!DOCTYPE html/i);
  });

  it('includes a closing </html> tag', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('</html>');
  });

  it('includes the spec file name', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('openapi.yaml');
  });

  it('includes the operation path', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('/api/users');
  });

  it('includes the HTTP method', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('GET');
  });

  it('uses the default title when no config is provided', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('API Coverage Report');
  });

  it('uses a custom title from config', () => {
    const html = generateHtmlReport(makeResult(), { title: 'My Custom Report Title' });
    expect(html).toContain('My Custom Report Title');
  });

  it('renders the custom title as a brand subtitle', () => {
    const html = generateHtmlReport(makeResult(), { title: 'My Custom Report Title' });
    expect(html).toContain('brand-subtitle');
  });

  it('includes summary card for Endpoints', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Endpoints');
  });

  it('includes summary card for Status Codes', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Status Codes');
  });

  it('includes summary card for Parameters', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Parameters');
  });

  it('includes summary card for Body Properties', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Body Properties');
  });

  it('includes summary card for Response Properties', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('Response Properties');
  });

  it('includes the operations count in a visible element', () => {
    const html = generateHtmlReport(makeResult());
    // result has 1 operation
    expect(html).toContain('>1<');
  });

  it('uses an auto-fill grid for summary cards', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('auto-fill');
  });

  it('shows green and red status code badges', () => {
    const op = makeOperation({
      statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: false, testRefs: [] } },
    });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('badge green');
    expect(html).toContain('badge red');
  });

  it('shows a green tick inside the mini progress bar for covered operations', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('mini-bar');
    expect(html).toContain('tick green');
    expect(html).toContain('✓');
  });

  it('shows a red cross inside the mini progress bar for uncovered operations', () => {
    const op = makeOperation({ covered: false });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('tick red');
    expect(html).toContain('✗');
  });

  it('includes the test reference in the detail row', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('GET /api/users — returns list');
  });

  it('does not include the unmatched hits section when there are none', () => {
    const html = generateHtmlReport(makeResult({ unmatchedHits: [] }));
    expect(html).not.toContain('Unmatched Hits');
  });

  it('includes the unmatched hits section when hits exist', () => {
    const html = generateHtmlReport(
      makeResult({
        unmatchedHits: [
          {
            method: 'GET',
            url: 'http://localhost/api/unknown',
            statusCode: 404,
            testTitle: 'some test',
            testFile: 'test.spec.ts',
          },
        ],
      })
    );
    expect(html).toContain('Unmatched Hits');
    expect(html).toContain('/api/unknown');
  });

  it('includes the dark/light theme button', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('theme-btn');
  });

  it('includes filter buttons (All, Covered, Uncovered)', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('data-filter="all"');
    expect(html).toContain('data-filter="covered"');
    expect(html).toContain('data-filter="uncovered"');
  });

  it('includes a tag filter button for each unique tag', () => {
    const op1 = makeOperation({ tags: ['users'], path: '/api/users', method: 'GET' });
    const op2 = makeOperation({ tags: ['health'], path: '/api/health', method: 'GET' });
    const html = generateHtmlReport(makeResult({ operations: [op1, op2] }));
    expect(html).toContain('data-filter="tag:users"');
    expect(html).toContain('data-filter="tag:health"');
  });

  it('HTML-escapes the custom title to prevent XSS', () => {
    const html = generateHtmlReport(makeResult(), { title: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('includes the playswag version in the footer', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('1.1.0');
  });

  it('includes a <meta charset> UTF-8 declaration', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toMatch(/charset=.UTF-8/i);
  });

  // ── Accent bar ──────────────────────────────────────────────────────────────

  it('renders a top accent gradient bar', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('accent-bar');
  });

  it('uses a blue-to-purple gradient on the accent bar', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('#2563eb');
    expect(html).toContain('#7c3aed');
  });

  // ── Logo ────────────────────────────────────────────────────────────────────

  it('renders the header logo at 64×64 when a data URL is provided', () => {
    const html = generateHtmlReport(makeResult(), {}, 'data:image/png;base64,FAKE');
    expect(html).toContain('width="64"');
    expect(html).toContain('height="64"');
  });

  it('embeds the provided logo data URL in the header img src', () => {
    const url = 'data:image/png;base64,FAKEDATA';
    const html = generateHtmlReport(makeResult(), {}, url);
    expect(html).toContain(`src="${url}"`);
  });

  it('renders the footer logo at 24×24 when a data URL is provided', () => {
    const html = generateHtmlReport(makeResult(), {}, 'data:image/png;base64,FAKE');
    expect(html).toContain('width="24"');
    expect(html).toContain('height="24"');
  });

  it('omits logo img tags when no data URL is provided', () => {
    const html = generateHtmlReport(makeResult(), {}, '');
    expect(html).not.toContain('<img');
  });

  // ── Overall score bar ───────────────────────────────────────────────────────

  it('renders the overall score bar section', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('score-bar');
    expect(html).toContain('score-fill');
  });

  it('includes the computed overall percentage in the score bar', () => {
    // summary: endpoints 75, statusCodes 75, parameters 50, bodyProperties 100, responseProperties 50
    // average = (75 + 75 + 50 + 100 + 50) / 5 = 70.0
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('70.0%');
  });

  // ── Tag group headers ────────────────────────────────────────────────────────

  it('renders a tag group header for each unique first-tag', () => {
    const op1 = makeOperation({ tags: ['users'], path: '/api/users', method: 'GET' });
    const op2 = makeOperation({ tags: ['health'], path: '/api/health', method: 'GET' });
    const html = generateHtmlReport(makeResult({ operations: [op1, op2] }));
    expect(html).toContain('tag-group-header');
  });

  it('renders a "General" group header for tagless operations', () => {
    const op = makeOperation({ tags: [], path: '/api/ping', method: 'GET' });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('General');
  });

  it('groups tagged operations before the General group', () => {
    const taggedOp = makeOperation({ tags: ['users'], path: '/api/users', method: 'GET' });
    const untaggedOp = makeOperation({ tags: [], path: '/api/ping', method: 'GET' });
    const html = generateHtmlReport(makeResult({ operations: [untaggedOp, taggedOp] }));
    const usersPos = html.indexOf('>users<');
    const generalPos = html.indexOf('>General<');
    expect(usersPos).toBeGreaterThan(-1);
    expect(generalPos).toBeGreaterThan(-1);
    expect(usersPos).toBeLessThan(generalPos);
  });

  it('renders group coverage counts in the group header', () => {
    const covered = makeOperation({ covered: true, tags: ['api'], path: '/api/a', method: 'GET' });
    const uncovered = makeOperation({ covered: false, tags: ['api'], path: '/api/b', method: 'POST' });
    const html = generateHtmlReport(makeResult({ operations: [covered, uncovered] }));
    // 1 covered out of 2 in this group
    expect(html).toContain('>1/2<');
  });

  it('renders collapsible group chevrons', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('group-chev');
    expect(html).toContain('gchev-');
  });

  // ── Mini progress bar ────────────────────────────────────────────────────────

  it('renders a mini-bar-wrap for each operation row', () => {
    const html = generateHtmlReport(makeResult());
    expect(html).toContain('mini-bar-wrap');
    expect(html).toContain('mini-bar-track');
  });

  it('sets a non-zero width on the mini bar for partially covered operations', () => {
    // Operation has 200 covered, 404 uncovered → scCovered=1, scTotal=2 → 50%
    const op = makeOperation({
      statusCodes: { '200': { covered: true, testRefs: [] }, '404': { covered: false, testRefs: [] } },
      parameters: [],
      bodyProperties: [],
      responseProperties: [],
    });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('50.0%"');
  });

  // ── Sparklines ───────────────────────────────────────────────────────────────

  it('renders sparkline SVG polylines when history entries are provided', () => {
    const history: HistoryEntry[] = [
      { timestamp: '2025-05-01T00:00:00.000Z', summary: { endpoints: { total: 4, covered: 2, percentage: 50 }, statusCodes: { total: 8, covered: 4, percentage: 50 }, parameters: { total: 4, covered: 1, percentage: 25 }, bodyProperties: { total: 2, covered: 1, percentage: 50 }, responseProperties: { total: 2, covered: 0, percentage: 0 } } },
      { timestamp: '2025-06-01T00:00:00.000Z', summary: { endpoints: { total: 4, covered: 3, percentage: 75 }, statusCodes: { total: 8, covered: 6, percentage: 75 }, parameters: { total: 4, covered: 2, percentage: 50 }, bodyProperties: { total: 2, covered: 2, percentage: 100 }, responseProperties: { total: 2, covered: 1, percentage: 50 } } },
    ];
    const html = generateHtmlReport(makeResult(), {}, '', history);
    expect(html).toContain('<polyline');
    expect(html).toContain('spark-line');
  });

  it('does not render sparklines when no history entries are provided', () => {
    const html = generateHtmlReport(makeResult(), {}, '', []);
    expect(html).not.toContain('<polyline');
  });

  // ── Deprecated operations ────────────────────────────────────────────────────

  it('adds the deprecated class to a deprecated operation block', () => {
    const op = makeOperation({ deprecated: true });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('op-block deprecated');
  });

  it('does not add the deprecated class to a non-deprecated operation', () => {
    const op = makeOperation({ deprecated: false });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).not.toContain('op-block deprecated');
  });

  it('renders the deprecated badge for a deprecated operation', () => {
    const op = makeOperation({ deprecated: true });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('<span class="deprecated-badge">deprecated</span>');
  });

  it('applies op-path-deprecated class to the path of a deprecated operation', () => {
    const op = makeOperation({ deprecated: true });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).toContain('op-path-deprecated');
  });

  it('does not render deprecated badge for a non-deprecated operation', () => {
    const op = makeOperation({ deprecated: false });
    const html = generateHtmlReport(makeResult({ operations: [op] }));
    expect(html).not.toContain('<span class="deprecated-badge">');
  });
});

describe('writeHtmlReport', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-html-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the report to the default filename', async () => {
    await writeHtmlReport(makeResult(), tmpDir, {});
    const content = await readFile(join(tmpDir, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('returns the full path of the written file', async () => {
    const path = await writeHtmlReport(makeResult(), tmpDir, {});
    expect(path).toBe(join(tmpDir, 'playswag-coverage.html'));
  });

  it('respects a custom fileName', async () => {
    await writeHtmlReport(makeResult(), tmpDir, { fileName: 'report.html' });
    const content = await readFile(join(tmpDir, 'report.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('creates the output directory if it does not exist', async () => {
    const nested = join(tmpDir, 'coverage', 'output');
    await writeHtmlReport(makeResult(), nested, {});
    const content = await readFile(join(nested, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('<!DOCTYPE html');
  });

  it('uses the custom title from config in written file', async () => {
    await writeHtmlReport(makeResult(), tmpDir, { title: 'E2E Coverage' });
    const content = await readFile(join(tmpDir, 'playswag-coverage.html'), 'utf8');
    expect(content).toContain('E2E Coverage');
  });
});
