import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PlayswagReporter from '../../src/reporter.js';
import type { EndpointHit, PlayswagConfig } from '../../src/types.js';
import { ATTACHMENT_NAME } from '../../src/constants.js';

/**
 * Build a minimal Playwright TestCase stub.
 */
function makeTestCase(overrides: {
  title?: string;
  file?: string;
  projectName?: string;
  projectUse?: Record<string, unknown>;
} = {}) {
  const { title = 'test title', file = '/tests/example.spec.ts', projectName, projectUse } = overrides;
  return {
    title,
    location: { file, line: 1, column: 1 },
    parent: {
      project: () => ({
        name: projectName ?? 'default',
        use: { baseURL: 'http://localhost:3456', ...projectUse },
      }),
    },
  } as never;
}

/**
 * Build a minimal Playwright TestResult stub with a playswag-hits attachment.
 */
function makeTestResult(hits: EndpointHit[]) {
  return {
    attachments: [
      {
        name: ATTACHMENT_NAME,
        contentType: 'application/json',
        body: Buffer.from(JSON.stringify(hits)),
      },
    ],
    status: 'passed',
  } as never;
}

/**
 * Build a minimal Playwright FullConfig stub.
 */
function makeFullConfig(projects: Array<{ name: string; use?: Record<string, unknown> }> = []) {
  return {
    projects: projects.map((p) => ({
      name: p.name,
      use: { baseURL: 'http://localhost:3456', ...p.use },
    })),
  } as never;
}

function makeSuite() {
  return {} as never;
}

describe('PlayswagReporter', () => {
  let originalCI: string | undefined;
  let originalDebug: string | undefined;

  beforeEach(() => {
    originalCI = process.env['CI'];
    originalDebug = process.env['PLAYSWAG_DEBUG'];
    delete process.env['CI'];
    delete process.env['PLAYSWAG_DEBUG'];
  });

  afterEach(() => {
    if (originalCI !== undefined) process.env['CI'] = originalCI;
    else delete process.env['CI'];
    if (originalDebug !== undefined) process.env['PLAYSWAG_DEBUG'] = originalDebug;
    else delete process.env['PLAYSWAG_DEBUG'];
    vi.restoreAllMocks();
  });

  describe('constructor defaults', () => {
    it('sets default outputDir', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const config = r['config'] as PlayswagConfig;
      expect(config.outputDir).toBe('./playswag-coverage');
    });

    it('sets default outputFormats', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const config = r['config'] as PlayswagConfig;
      expect(config.outputFormats).toEqual(['console', 'json']);
    });

    it('sets default failOnThreshold to false', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const config = r['config'] as PlayswagConfig;
      expect(config.failOnThreshold).toBe(false);
    });

    it('preserves user-supplied outputDir', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml', outputDir: './custom' }) as Record<string, unknown>;
      const config = r['config'] as PlayswagConfig;
      expect(config.outputDir).toBe('./custom');
    });
  });

  describe('printsToStdio', () => {
    it('returns true when console is in outputFormats', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml', outputFormats: ['console'] });
      expect(r.printsToStdio()).toBe(true);
    });

    it('returns false when console is not in outputFormats', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml', outputFormats: ['json'] });
      expect(r.printsToStdio()).toBe(false);
    });

    it('returns false when console output is explicitly disabled', () => {
      const r = new PlayswagReporter({
        specs: './spec.yaml',
        outputFormats: ['console'],
        consoleOutput: { enabled: false },
      });
      expect(r.printsToStdio()).toBe(false);
    });
  });

  describe('onBegin', () => {
    it('extracts baseURL from first project when not configured', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      r['onBegin'](
        makeFullConfig([{ name: 'proj', use: { baseURL: 'http://my-api:8080' } }]),
        makeSuite()
      );
      expect(r['baseURL']).toBe('http://my-api:8080');
    });

    it('prefers config.baseURL over project baseURL', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml', baseURL: 'http://config-url' }) as Record<string, unknown>;
      r['onBegin'](
        makeFullConfig([{ name: 'proj', use: { baseURL: 'http://project-url' } }]),
        makeSuite()
      );
      expect(r['baseURL']).toBe('http://config-url');
    });
  });

  describe('onTestEnd', () => {
    it('aggregates hits from test attachments', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost:3456/api/users', statusCode: 200, testFile: '', testTitle: '' },
      ];
      r['onTestEnd'](makeTestCase(), makeTestResult(hits));
      expect((r['aggregatedHits'] as EndpointHit[]).length).toBe(1);
    });

    it('fills testFile and testTitle from test location', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost:3456/api/users', statusCode: 200, testFile: '', testTitle: '' },
      ];
      r['onTestEnd'](makeTestCase({ title: 'my test', file: '/tests/my.spec.ts' }), makeTestResult(hits));
      const aggregated = r['aggregatedHits'] as EndpointHit[];
      expect(aggregated[0]?.testFile).toBe('/tests/my.spec.ts');
      expect(aggregated[0]?.testTitle).toBe('my test');
    });

    it('tags hits with projectName', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost:3456/api/users', statusCode: 200, testFile: '', testTitle: '' },
      ];
      r['onTestEnd'](makeTestCase({ projectName: 'my-project' }), makeTestResult(hits));
      const aggregated = r['aggregatedHits'] as EndpointHit[];
      expect(aggregated[0]?.projectName).toBe('my-project');
    });

    it('ignores attachments with wrong name', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      r['onTestEnd'](
        makeTestCase(),
        {
          attachments: [
            { name: 'other-attachment', contentType: 'text/plain', body: Buffer.from('irrelevant') },
          ],
          status: 'passed',
        } as never
      );
      expect((r['aggregatedHits'] as EndpointHit[]).length).toBe(0);
    });

    it('handles malformed JSON in attachment gracefully', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      r['onTestEnd'](
        makeTestCase(),
        {
          attachments: [
            { name: ATTACHMENT_NAME, contentType: 'application/json', body: Buffer.from('not-json{{') },
          ],
          status: 'passed',
        } as never
      );
      expect((r['aggregatedHits'] as EndpointHit[]).length).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('[playswag]'));
    });

    it('records projectOverrides when playswagSpecs is set in project use', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost:3456/api/health', statusCode: 200, testFile: '', testTitle: '' },
      ];
      r['onTestEnd'](
        makeTestCase({ projectName: 'svc-a', projectUse: { playswagSpecs: './svc-a.yaml' } }),
        makeTestResult(hits)
      );
      const overrides = r['projectOverrides'] as Map<string, unknown>;
      expect(overrides.has('svc-a')).toBe(true);
    });

    it('increments totalTestCount for each test', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as Record<string, unknown>;
      r['onTestEnd'](makeTestCase(), makeTestResult([]));
      r['onTestEnd'](makeTestCase(), makeTestResult([]));
      expect(r['totalTestCount']).toBe(2);
    });
  });

  describe('filterHits', () => {
    it('passes all hits when no include/exclude patterns set', () => {
      const r = new PlayswagReporter({ specs: './spec.yaml' }) as { filterHits: (h: EndpointHit[]) => EndpointHit[] };
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost/api/users', statusCode: 200, testFile: '', testTitle: '' },
        { method: 'GET', url: 'http://localhost/api/health', statusCode: 200, testFile: '', testTitle: '' },
      ];
      expect(r.filterHits(hits)).toHaveLength(2);
    });

    it('filters by includePatterns', () => {
      const r = new PlayswagReporter({
        specs: './spec.yaml',
        includePatterns: ['/api/users/**'],
      }) as { filterHits: (h: EndpointHit[]) => EndpointHit[] };
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost/api/users', statusCode: 200, testFile: '', testTitle: '' },
        { method: 'GET', url: 'http://localhost/api/health', statusCode: 200, testFile: '', testTitle: '' },
      ];
      const filtered = r.filterHits(hits);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.url).toContain('/api/users');
    });

    it('filters by excludePatterns', () => {
      const r = new PlayswagReporter({
        specs: './spec.yaml',
        excludePatterns: ['/api/health'],
      }) as { filterHits: (h: EndpointHit[]) => EndpointHit[] };
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost/api/users', statusCode: 200, testFile: '', testTitle: '' },
        { method: 'GET', url: 'http://localhost/api/health', statusCode: 200, testFile: '', testTitle: '' },
      ];
      const filtered = r.filterHits(hits);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.url).toContain('/api/users');
    });

    it('applies both include and exclude patterns', () => {
      const r = new PlayswagReporter({
        specs: './spec.yaml',
        includePatterns: ['/api/**'],
        excludePatterns: ['/api/health'],
      }) as { filterHits: (h: EndpointHit[]) => EndpointHit[] };
      const hits: EndpointHit[] = [
        { method: 'GET', url: 'http://localhost/api/users', statusCode: 200, testFile: '', testTitle: '' },
        { method: 'GET', url: 'http://localhost/api/health', statusCode: 200, testFile: '', testTitle: '' },
        { method: 'GET', url: 'http://localhost/other', statusCode: 200, testFile: '', testTitle: '' },
      ];
      const filtered = r.filterHits(hits);
      expect(filtered).toHaveLength(1);
      expect(filtered[0]?.url).toContain('/api/users');
    });

    it('handles bare path URLs (no origin) gracefully', () => {
      const r = new PlayswagReporter({
        specs: './spec.yaml',
        includePatterns: ['/api/**'],
      }) as { filterHits: (h: EndpointHit[]) => EndpointHit[] };
      const hits: EndpointHit[] = [
        { method: 'GET', url: '/api/users', statusCode: 200, testFile: '', testTitle: '' },
      ];
      const filtered = r.filterHits(hits);
      expect(filtered).toHaveLength(1);
    });
  });
});
