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
import type { EndpointHit, PlayswagConfig } from './types.js';
import type { HistoryEntry } from './output/history.js';
import { ATTACHMENT_NAME } from './constants.js';
import { parseSpecs } from './openapi/parser.js';
import { calculateCoverage } from './coverage/calculator.js';
import { printConsoleReport, checkThresholds } from './output/console.js';
import { writeJsonReport } from './output/json.js';
import { writeHtmlReport } from './output/html.js';
import { writeBadge } from './output/badge.js';
import { writeJUnitReport } from './output/junit.js';
import { appendToHistory, loadLastEntry, loadAllEntries, compareCoverage } from './output/history.js';
import { isGitHubActions, emitAnnotations, writeStepSummary } from './output/github-actions.js';



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
    const pkgPath = fileURLToPath(new URL('../package.json', import.meta.url));
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as { version?: string };
    return pkg.version ?? 'unknown';
  } catch {
    try {
      const require = createRequire(import.meta.url);
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const pkgPath = resolve(currentDir, '../package.json');
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
 *
 * Configure in playwright.config.ts:
 * ```ts
 * reporter: [
 *   ['@michalfidor/playswag/reporter', {
 *     specs: './openapi.yaml',
 *     outputDir: './playswag-coverage',
 *   }]
 * ]
 * ```
 */
class PlayswagReporter implements Reporter {
  private readonly config: Required<
    Pick<PlayswagConfig, 'outputDir' | 'outputFormats' | 'failOnThreshold'>
  > &
    PlayswagConfig;

  private aggregatedHits: EndpointHit[] = [];
  private readonly projectOverrides = new Map<string, { specs: string | string[]; baseURL?: string }>();
  private baseURL: string | undefined;
  private totalTestCount = 0;

  constructor(config: PlayswagConfig) {
    this.config = {
      outputDir: './playswag-coverage',
      outputFormats: ['console', 'json'],
      failOnThreshold: false,
      ...config,
    };
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
    this.totalTestCount++;

    for (const attachment of result.attachments) {
      if (attachment.name !== ATTACHMENT_NAME) continue;

      let raw: string | undefined;
      if (attachment.body) {
        raw = attachment.body.toString('utf8');
      } else if (attachment.path) {
        try {
          raw = readFileSync(attachment.path, 'utf8');
        } catch (err) {
          console.warn(`[playswag] Could not read attachment file "${attachment.path}": ${(err as Error).message}`);
          continue;
        }
      }

      if (!raw) continue;

      let hits: EndpointHit[];
      try {
        hits = JSON.parse(raw) as EndpointHit[];
      } catch (err) {
        console.warn(`[playswag] Could not parse hits attachment for test "${test.title}": ${(err as Error).message}`);
        continue;
      }

      const proj = test.parent.project();
      const use = proj?.use as Record<string, unknown> | undefined;
      const projSpecs = use?.['playswagSpecs'] as string | string[] | undefined;
      const projBaseURL = (use?.['playswagBaseURL'] as string | undefined) ?? proj?.use?.baseURL;

      if (projSpecs && proj?.name) {
        this.projectOverrides.set(proj.name, { specs: projSpecs, baseURL: projBaseURL });
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
    if (this.projectOverrides.size > 0) {
      return this.runMultiProjectCoverage();
    }

    if (!this.config.specs) {
      console.warn('[playswag] No specs configured — skipping coverage. Set the `specs` option in your reporter config.');
      return;
    }

    const failed = await this.runOutputsForGroup(
      this.filterHits(this.aggregatedHits),
      this.config.specs,
      this.baseURL,
      this.config.outputDir,
    );
    if (failed) return { status: 'failed' };
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

    let anyFailed = false;

    for (const [projectName, override] of this.projectOverrides) {
      const projectHits = this.filterHits(hitsByProject.get(projectName) ?? []);
      const projectOutputDir = join(this.config.outputDir, projectName);
      const projectBaseURL = override.baseURL ?? this.baseURL;
      const failed = await this.runOutputsForGroup(projectHits, override.specs, projectBaseURL, projectOutputDir);
      if (failed) anyFailed = true;
    }

    if (globalHits.length > 0 && this.config.specs) {
      const failed = await this.runOutputsForGroup(
        this.filterHits(globalHits),
        this.config.specs,
        this.baseURL,
        this.config.outputDir,
      );
      if (failed) anyFailed = true;
    }

    if (anyFailed) return { status: 'failed' };
  }

  private async runOutputsForGroup(
    filteredHits: EndpointHit[],
    specsInput: string | string[],
    baseURL: string | undefined,
    outputDir: string,
  ): Promise<boolean> {
    let spec;
    try {
      spec = await parseSpecs(specsInput);
    } catch (err) {
      console.error(`[playswag] Could not parse spec(s): ${(err as Error).message}`);
      return false;
    }

    if (spec.operations.length === 0) {
      console.warn('[playswag] No operations found in the provided spec(s). Coverage cannot be calculated.');
      return false;
    }

    const coverageResult = calculateCoverage(filteredHits, spec, {
      baseURL,
      playwrightVersion: tryReadVersion('@playwright/test'),
      playswagVersion: readPlayswagVersion(),
      totalTestCount: this.totalTestCount,
    });

    // ── History: load previous entry for delta, then load all for sparklines ──
    const historyConfig = this.config.history ? { enabled: true, ...this.config.history } : undefined;
    let delta;
    let historyEntries: HistoryEntry[] = [];
    if (historyConfig?.enabled !== false) {
      try {
        const prev = await loadLastEntry(outputDir, historyConfig ?? {});
        if (prev) delta = compareCoverage(coverageResult.summary, prev.summary);
        historyEntries = await loadAllEntries(outputDir, historyConfig ?? {});
      } catch (err) {
        console.warn(`[playswag] Could not read history: ${(err as Error).message}`);
      }
    }

    const formats = this.config.outputFormats;

    if (formats.includes('console')) {
      const consoleConfig = { enabled: true, ...this.config.consoleOutput };
      if (consoleConfig.enabled !== false) {
        await printConsoleReport(
          coverageResult,
          consoleConfig,
          this.config.threshold,
          this.config.failOnThreshold,
          delta
        );
      }
    }

    if (formats.includes('json')) {
      const jsonConfig = { enabled: true, ...this.config.jsonOutput };
      if (jsonConfig.enabled !== false) {
        try {
          const path = await writeJsonReport(coverageResult, outputDir, jsonConfig);
          console.log(`[playswag] Coverage report written to ${path}`);
        } catch (err) {
          console.error(`[playswag] Failed to write JSON report: ${(err as Error).message}`);
        }
      }
    }

    if (formats.includes('html')) {
      const htmlConfig = { enabled: true, ...this.config.htmlOutput };
      if (htmlConfig.enabled !== false) {
        try {
          const writtenPath = await writeHtmlReport(coverageResult, outputDir, htmlConfig, historyEntries);
          const absPath = resolve(writtenPath);
          if (process.env['CI']) {
            console.log(`[playswag] HTML report written to ${absPath}`);
          } else {
            console.log(`[playswag] HTML report → file://${absPath}`);
          }
        } catch (err) {
          console.error(`[playswag] Failed to write HTML report: ${(err as Error).message}`);
        }
      }
    }

    if (formats.includes('badge')) {
      const badgeConfig = { enabled: true, ...this.config.badge };
      if (badgeConfig.enabled !== false) {
        try {
          const path = await writeBadge(coverageResult, outputDir, badgeConfig);
          console.log(`[playswag] Badge written to ${path}`);
        } catch (err) {
          console.error(`[playswag] Failed to write badge: ${(err as Error).message}`);
        }
      }
    }

    if (formats.includes('junit')) {
      const junitConfig = { enabled: true, ...this.config.junitOutput };
      if (junitConfig.enabled !== false) {
        try {
          const path = await writeJUnitReport(coverageResult, outputDir, this.config.threshold, junitConfig);
          console.log(`[playswag] JUnit report written to ${path}`);
        } catch (err) {
          console.error(`[playswag] Failed to write JUnit report: ${(err as Error).message}`);
        }
      }
    }

    // ── Append to history after all reports are written ─────────────────────
    if (historyConfig?.enabled !== false) {
      try {
        await appendToHistory(coverageResult, outputDir, historyConfig ?? {});
      } catch (err) {
        console.warn(`[playswag] Could not write history: ${(err as Error).message}`);
      }
    }

    const violations = this.config.threshold
      ? checkThresholds(coverageResult, this.config.threshold, this.config.failOnThreshold)
      : [];

    // ── GitHub Actions annotations and step summary ──────────────────────────
    if (isGitHubActions()) {
      if (violations.length > 0) emitAnnotations(violations);
      try {
        await writeStepSummary(coverageResult, violations);
      } catch (err) {
        console.warn(`[playswag] Could not write GitHub step summary: ${(err as Error).message}`);
      }
    }

    return violations.some((v) => v.fail);
  }

  printsToStdio(): boolean {
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
