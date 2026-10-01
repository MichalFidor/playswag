import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
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
  FullProject,
} from '@playwright/test/reporter';
import type { AcknowledgedService, EndpointHit, NormalizedSpec, PlayswagConfig } from './types.js';
import { ATTACHMENT_NAME } from './constants.js';
import { log } from './log.js';
import { validatePlayswagConfig, resolveFailOnSpecError } from './config/validate.js';
import { parseJsonWithLimit, DEFAULT_MAX_JSON_BYTES, isEndpointHits, readJsonFileWithLimitSync } from './utils/safe-json.js';
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

/** Keep ordinary project paths stable, while avoiding traversal, platform names and collisions. */
function projectDirectories(names: string[]): Map<string, string> {
  const labels = new Map(names.map((name) => [name, name.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.+$/, '').slice(0, 100) || 'project']));
  const counts = new Map<string, number>();
  for (const label of labels.values()) counts.set(label.toLowerCase(), (counts.get(label.toLowerCase()) ?? 0) + 1);
  const used = new Set<string>();
  const result = new Map<string, string>();
  for (const name of [...names].sort()) {
    const label = labels.get(name)!;
    const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(label);
    const needsSuffix = name !== label || reserved || counts.get(label.toLowerCase())! > 1;
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 12);
    const base = needsSuffix ? `${reserved ? 'project-' : ''}${label}-${hash}` : label;
    let directory = base;
    for (let suffix = 1; used.has(directory.toLowerCase()); suffix++) directory = `${base}-${suffix}`;
    used.add(directory.toLowerCase());
    result.set(name, directory);
  }
  return result;
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
  private readonly globalProjects = new Set<string>();
  private readonly disabledProjects = new Set<string>();
  private inputError = false;
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
    if (isPlayswagDisabled()) return;
    // The suite contains the projects selected for this run, even before any hits exist.
    const selectedProjects = _suite.suites?.map((suite) => suite.project()).filter((p): p is FullProject => p !== undefined);
    const projects = selectedProjects?.length ? selectedProjects : playwrightConfig.projects;
    for (const project of projects) {
      this.registerProject(project);
    }
    const enabledProjects = projects.filter((project) => !this.disabledProjects.has(project.name));
    const globalProjects = enabledProjects.filter((project) => this.globalProjects.has(project.name));
    this.baseURL = this.config.baseURL ?? globalProjects.find((project) => project.use.baseURL)?.use.baseURL;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (isPlayswagDisabled()) return;

    const proj = test.parent.project();
    if (proj) this.registerProject(proj);
    if (this.disabledProjects.has(proj?.name ?? 'default')) return;

    this.totalTestCount++;
    const projName = test.parent.project()?.name ?? 'default';
    this.testCountByProject.set(projName, (this.testCountByProject.get(projName) ?? 0) + 1);

    const maxAttachmentBytes = this.config.maxAttachmentBytes ?? DEFAULT_MAX_JSON_BYTES;

    for (const attachment of result.attachments) {
      if (attachment.name !== ATTACHMENT_NAME) continue;

      let hits: EndpointHit[];
      try {
        let parsed: unknown;
        if (attachment.body) {
          if (attachment.body.length > maxAttachmentBytes) throw new Error('Hits attachment exceeds maxAttachmentBytes');
          parsed = parseJsonWithLimit<unknown>(attachment.body.toString('utf8'), maxAttachmentBytes);
        } else if (attachment.path) {
          parsed = readJsonFileWithLimitSync(attachment.path, maxAttachmentBytes);
        } else continue;
        if (!isEndpointHits(parsed)) throw new Error('Invalid hits attachment structure');
        hits = parsed;
      } catch (err) {
        this.inputError = true;
        log.warn(`Could not parse hits attachment for test "${test.title}": ${(err as Error).message}`);
        continue;
      }

      for (const hit of hits) {
        if (!hit.testFile) hit.testFile = test.location.file;
        if (!hit.testTitle) hit.testTitle = test.title;
        hit.projectName = proj?.name;
      }

      for (const hit of hits) this.aggregatedHits.push(hit);
    }
  }

  private registerProject(project: FullProject): void {
    const use = project.use as Record<string, unknown>;
    if (use['playswagEnabled'] === false) {
      this.disabledProjects.add(project.name);
      return;
    }
    const specs = use['playswagSpecs'] as string | string[] | undefined;
    if (specs) {
      this.projectOverrides.set(project.name, {
        specs,
        baseURL: (use['playswagBaseURL'] as string | undefined) ?? project.use.baseURL,
        acknowledgedServices: use['playswagAcknowledgedServices'] as AcknowledgedService[] | undefined,
      });
    } else this.globalProjects.add(project.name);
  }

  async onEnd(_result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    if (isPlayswagDisabled()) {
      if (process.env['PLAYSWAG_DEBUG']) {
        log.info('Coverage skipped — PLAYSWAG_DISABLED is set.');
      }
      return;
    }

    if (this.disabledProjects.size > 0 && this.projectOverrides.size === 0 && this.globalProjects.size === 0) {
      log.info('Coverage skipped — playswag is disabled in all selected projects.');
      return;
    }

    const stopProgress = startProgress('Calculating coverage…');

    if (this.projectOverrides.size > 0) {
      stopProgress();
      const runResult = await this.runMultiProjectCoverage();
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
    log.info('Coverage complete.');
    if (this.shouldFailRun(run)) return { status: 'failed' };
  }

  private shouldFailRun(run: RunGroupResult): boolean {
    if (this.inputError && resolveFailOnSpecError(this.config)) return true;
    if (run.specError && resolveFailOnSpecError(this.config)) return true;
    if (run.outputError && this.config.failOnOutputError) return true;
    return run.thresholdFailed;
  }

  private async runMultiProjectCoverage(): Promise<{ status?: FullResult['status'] } | void> {
    const hitsByProject = new Map<string, EndpointHit[]>();
    const globalHits: EndpointHit[] = [];

    for (const hit of this.aggregatedHits) {
      if (hit.projectName !== undefined && this.projectOverrides.has(hit.projectName)) {
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

    const directories = projectDirectories([...this.projectOverrides.keys()]);
    for (const [projectName, override] of this.projectOverrides) {
      const run = await this.pipeline.runOutputsForGroup(
        this.filterHits(hitsByProject.get(projectName) ?? []),
        override.specs,
        override.baseURL ?? this.baseURL,
        join(this.config.outputDir, directories.get(projectName)!),
        [
          ...(this.config.acknowledgedServices ?? []),
          ...(override.acknowledgedServices ?? []),
        ],
        this.testCountByProject.get(projectName) ?? 0,
        { name: projectName },
      );
      this.mergeRunResult(combined, run);
    }

    if ((this.globalProjects.size > 0 || globalHits.length > 0) && this.config.specs) {
      const run = await this.pipeline.runOutputsForGroup(
        this.filterHits(globalHits),
        this.config.specs,
        this.baseURL,
        this.config.outputDir,
        undefined,
        [...this.globalProjects].reduce((sum, name) => sum + (this.testCountByProject.get(name) ?? 0), 0),
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
