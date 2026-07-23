import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import picomatch from 'picomatch';
import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult,
} from '@playwright/test/reporter';
import type { AcknowledgedService, EndpointHit, NormalizedSpec, PlayswagConfig } from './types.js';
import { ATTACHMENT_NAME } from './constants.js';
import { log } from './log.js';
import { validatePlayswagConfig, resolveFailOnSpecError } from './config/validate.js';
import { parseJsonWithLimit, DEFAULT_MAX_JSON_BYTES } from './utils/safe-json.js';
import { startProgress } from './output/progress.js';
import { CoveragePipeline, type RunGroupResult } from './reporter/coverage-pipeline.js';
import { isPlayswagDisabled } from './utils/env.js';

function tryReadVersion(packageName: string): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg: { version?: string } = require(`${packageName}/package.json`);
    return pkg.version ?? 'unknown';
  } catch (err) {
    if (process.env['PLAYSWAG_DEBUG']) {
      console.log(`[playswag:debug] Could not read version for "${packageName}": ${(err as Error).message}`);
    }
    return 'unknown';
  }
}

function readPlayswagVersion(): string {
  try {
    const pkgPath = fileURLToPath(new URL('../../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    try {
      const require = createRequire(import.meta.url);
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const pkgPath = resolve(currentDir, '../../package.json');
      const pkg: { version?: string } = require(pkgPath);
      return pkg.version ?? 'unknown';
    } catch (err) {
      if (process.env['PLAYSWAG_DEBUG']) {
        console.log(`[playswag:debug] Could not read playswag version: ${(err as Error).message}`);
      }
      return 'unknown';
    }
  }
}

/**
 * Playwright reporter that aggregates API call data from all workers and
 * computes coverage against the provided OpenAPI/Swagger specification(s).
 */
class PlayswagReporter implements Reporter {
  private readonly config: Required<
    Pick<PlayswagConfig, 'outputDir' | 'outputFormats' | 'failOnThreshold'>
  > &
    PlayswagConfig;

  private readonly pipeline: CoveragePipeline;
  private aggregatedHits: EndpointHit[] = [];
  private readonly projectOverrides = new Map<string, { specs: string | string[]; baseURL?: string; acknowledgedServices?: AcknowledgedService[] }>();
  private readonly testCountByProject = new Map<string, number>();
  private baseURL: string | undefined;
  private totalTestCount = 0;

  constructor(config: PlayswagConfig) {
    this.config = {
      outputDir: './playswag-coverage',
      outputFormats: ['console', 'json'],
      failOnThreshold: false,
      ...config,
    };
    if (!isPlayswagDisabled()) {
      validatePlayswagConfig(this.config);
    }
    this.pipeline = new CoveragePipeline(this.config, {
      tryReadVersion,
      readPlayswagVersion,
    });
  }

  onBegin(playwrightConfig: FullConfig, _suite: Suite): void {
    if (!this.config.baseURL) {
      for (const project of playwrightConfig.projects) {
        const base = project.use?.baseURL;
        if (base) {
          this.baseURL = base;
          break;
        }
      }
    } else {
      this.baseURL = this.config.baseURL;
    }
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (isPlayswagDisabled()) return;

    this.totalTestCount++;
    const projName = test.parent.project()?.name ?? 'default';
    this.testCountByProject.set(projName, (this.testCountByProject.get(projName) ?? 0) + 1);

    const maxAttachmentBytes = this.config.maxAttachmentBytes ?? DEFAULT_MAX_JSON_BYTES;

    for (const attachment of result.attachments) {
      if (attachment.name !== ATTACHMENT_NAME) continue;

      let raw: string | undefined;
      if (attachment.body) {
        raw = attachment.body.toString('utf8');
      } else if (attachment.path) {
        try {
          raw = readFileSync(attachment.path, 'utf8');
        } catch (err) {
          log.warn(`Could not read attachment file "${attachment.path}": ${(err as Error).message}`);
          continue;
        }
      }

      if (!raw) continue;

      let hits: EndpointHit[];
      try {
        hits = parseJsonWithLimit<EndpointHit[]>(raw, maxAttachmentBytes);
      } catch (err) {
        log.warn(`Could not parse hits attachment for test "${test.title}": ${(err as Error).message}`);
        continue;
      }

      const proj = test.parent.project();
      const use = proj?.use as Record<string, unknown> | undefined;
      const projSpecs = use?.['playswagSpecs'] as string | string[] | undefined;
      const projBaseURL = (use?.['playswagBaseURL'] as string | undefined) ?? proj?.use?.baseURL;
      const projAcknowledgedServices = use?.['playswagAcknowledgedServices'] as AcknowledgedService[] | undefined;

      if (projSpecs && proj?.name) {
        this.projectOverrides.set(proj.name, { specs: projSpecs, baseURL: projBaseURL, acknowledgedServices: projAcknowledgedServices });
      }

      for (const hit of hits) {
        if (!hit.testFile) hit.testFile = test.location.file;
        if (!hit.testTitle) hit.testTitle = test.title;
        hit.projectName = proj?.name;
      }

      this.aggregatedHits.push(...hits);
    }
  }

  async onEnd(_result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    if (isPlayswagDisabled()) {
      if (process.env['PLAYSWAG_DEBUG']) {
        log.info('Coverage skipped — PLAYSWAG_DISABLED is set.');
      }
      return;
    }

    const stopProgress = startProgress('Calculating coverage…');

    if (this.projectOverrides.size > 0) {
      stopProgress();
      const runResult = await this.runMultiProjectCoverage();
      await this.releaseHttpConnections();
      log.info('Coverage complete.');
      return runResult;
    }

    if (!this.config.specs) {
      stopProgress('Coverage skipped — no specs configured.');
      log.warn('No specs configured — skipping coverage.', 'Set the `specs` option in your reporter config.');
      return;
    }

    stopProgress();
    const run = await this.pipeline.runOutputsForGroup(
      this.filterHits(this.aggregatedHits),
      this.config.specs,
      this.baseURL,
      this.config.outputDir,
      undefined,
      this.totalTestCount,
    );
    await this.releaseHttpConnections();
    log.info('Coverage complete.');
    if (this.shouldFailRun(run)) return { status: 'failed' };
  }

  private shouldFailRun(run: RunGroupResult): boolean {
    if (run.specError && resolveFailOnSpecError(this.config)) return true;
    if (run.outputError && this.config.failOnOutputError) return true;
    return run.thresholdFailed;
  }

  private async runMultiProjectCoverage(): Promise<{ status?: FullResult['status'] } | void> {
    const hitsByProject = new Map<string, EndpointHit[]>();
    const globalHits: EndpointHit[] = [];

    for (const hit of this.aggregatedHits) {
      if (hit.projectName && this.projectOverrides.has(hit.projectName)) {
        const arr = hitsByProject.get(hit.projectName) ?? [];
        arr.push(hit);
        hitsByProject.set(hit.projectName, arr);
      } else {
        globalHits.push(hit);
      }
    }

    const combined: RunGroupResult = {
      thresholdFailed: false,
      specError: false,
      outputError: false,
    };

    for (const [projectName, override] of this.projectOverrides) {
      const run = await this.pipeline.runOutputsForGroup(
        this.filterHits(hitsByProject.get(projectName) ?? []),
        override.specs,
        override.baseURL ?? this.baseURL,
        join(this.config.outputDir, projectName),
        [
          ...(this.config.acknowledgedServices ?? []),
          ...(override.acknowledgedServices ?? []),
        ],
        this.testCountByProject.get(projectName) ?? 0,
      );
      this.mergeRunResult(combined, run);
    }

    if (globalHits.length > 0 && this.config.specs) {
      const run = await this.pipeline.runOutputsForGroup(
        this.filterHits(globalHits),
        this.config.specs,
        this.baseURL,
        this.config.outputDir,
        undefined,
        this.totalTestCount,
      );
      this.mergeRunResult(combined, run);
    }

    if (this.shouldFailRun(combined)) return { status: 'failed' };
  }

  private mergeRunResult(target: RunGroupResult, source: RunGroupResult): void {
    target.thresholdFailed ||= source.thresholdFailed;
    target.specError ||= source.specError;
    target.outputError ||= source.outputError;
  }

  private async releaseHttpConnections(): Promise<void> {
    try {
      const UNDICI_SYM = 'Symbol(undici.globalDispatcher.1)';
      const sym = Object.getOwnPropertySymbols(globalThis)
        .find((s) => s.toString() === UNDICI_SYM);
      if (!sym) return;
      const old = (globalThis as Record<symbol, { constructor: new () => unknown; close?: () => Promise<void> }>)[sym];
      if (!old || typeof old.close !== 'function') return;
      const fresh = new old.constructor();
      await old.close();
      (globalThis as Record<symbol, unknown>)[sym] = fresh;
      if (process.env['PLAYSWAG_DEBUG']) {
        console.log('[playswag:debug] releaseHttpConnections: undici keep-alive connections closed');
      }
    } catch {
      // Silently ignore — undici internals differ across Node.js versions
    }
  }

  /** @internal Delegates to {@link CoveragePipeline} — used by unit tests. */
  filterOperationsByTags(spec: NormalizedSpec) {
    return this.pipeline.filterOperationsByTags(spec);
  }

  printsToStdio(): boolean {
    if (isPlayswagDisabled()) return false;
    const formats = this.config.outputFormats;
    const consoleEnabled = this.config.consoleOutput?.enabled !== false;
    return formats.includes('console') && consoleEnabled;
  }

  private filterHits(hits: EndpointHit[]): EndpointHit[] {
    const { includePatterns, excludePatterns } = this.config;
    if (!includePatterns?.length && !excludePatterns?.length) return hits;

    return hits.filter((hit) => {
      let path: string;
      try {
        path = new URL(hit.url).pathname;
      } catch {
        path = hit.url;
      }

      if (includePatterns?.length) {
        const included = includePatterns.some((p) => picomatch.isMatch(path, p));
        if (!included) return false;
      }

      if (excludePatterns?.length) {
        const excluded = excludePatterns.some((p) => picomatch.isMatch(path, p));
        if (excluded) return false;
      }

      return true;
    });
  }
}

export default PlayswagReporter;
