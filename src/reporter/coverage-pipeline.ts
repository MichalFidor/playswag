import picomatch from 'picomatch';
import { log } from '../log.js';
import type {
  AcknowledgedService,
  CoverageResult,
  EndpointHit,
  NormalizedSpec,
  PlayswagConfig,
} from '../types.js';
import type { HistoryEntry, CoverageDelta } from '../output/history.js';
import { parseSpecs } from '../openapi/parser.js';
import { calculateCoverage } from '../coverage/calculator.js';
import { printConsoleReport, checkThresholds } from '../output/console.js';
import { writeJsonReport } from '../output/json.js';
import { writeHtmlReport } from '../output/html.js';
import { writeBadge } from '../output/badge.js';
import { writeJUnitReport } from '../output/junit.js';
import { appendToHistory, loadLastEntry, loadAllEntries, compareCoverage } from '../output/history.js';
import { isGitHubActions, emitAnnotations, writeStepSummary } from '../output/github-actions.js';
import { writeMarkdownReport } from '../output/markdown.js';

export interface RunGroupResult {
  thresholdFailed: boolean;
  specError: boolean;
  outputError: boolean;
}

export interface CoveragePipelineDeps {
  tryReadVersion: (pkg: string) => string;
  readPlayswagVersion: () => string;
}

/**
 * Parses specs, calculates coverage, and emits configured output formats.
 * Extracted from the Playwright reporter for testability and maintainability.
 */
export class CoveragePipeline {
  constructor(
    private readonly config: PlayswagConfig,
    private readonly deps: CoveragePipelineDeps
  ) {}

  filterOperationsByTags(spec: NormalizedSpec): NormalizedSpec {
    const { includeTags, excludeTags, includeUntagged } = this.config;
    if (!includeTags?.length && !excludeTags?.length) return spec;

    const operations = spec.operations.filter((op) => {
      const tags = op.tags ?? [];
      if (includeTags?.length) {
        const included =
          tags.length === 0
            ? includeUntagged === true
            : tags.some((t) => includeTags.some((p) => picomatch.isMatch(t, p)));
        if (!included) return false;
      }
      if (excludeTags?.length) {
        const excluded = tags.some((t) => excludeTags.some((p) => picomatch.isMatch(t, p)));
        if (excluded) return false;
      }
      return true;
    });

    return { ...spec, operations };
  }

  async runOutputsForGroup(
    filteredHits: EndpointHit[],
    specsInput: string | string[],
    baseURL: string | undefined,
    outputDir: string,
    acknowledgedServices?: AcknowledgedService[],
    totalTestCount = 0,
  ): Promise<RunGroupResult> {
    const result: RunGroupResult = {
      thresholdFailed: false,
      specError: false,
      outputError: false,
    };

    let spec;
    try {
      spec = await parseSpecs(specsInput, {
        allowedSpecHosts: this.config.allowedSpecHosts,
        allowPrivateHosts: this.config.allowPrivateHosts,
        specFetchTimeoutMs: this.config.specFetchTimeoutMs,
        maxSpecBytes: this.config.maxSpecBytes,
      });
    } catch (err) {
      log.error(`Could not parse spec(s): ${(err as Error).message}`);
      result.specError = true;
      return result;
    }

    if (spec.operations.length === 0) {
      log.warn('No operations found in the provided spec(s). Coverage cannot be calculated.');
      result.specError = true;
      return result;
    }

    spec = this.filterOperationsByTags(spec);

    const schemaDepth = this.config.schemaDepth != null
      ? Math.min(10, Math.max(1, this.config.schemaDepth))
      : undefined;

    const coverageResult = calculateCoverage(filteredHits, spec, {
      baseURL,
      playwrightVersion: this.deps.tryReadVersion('@playwright/test'),
      playswagVersion: this.deps.readPlayswagVersion(),
      totalTestCount,
      requiredParamsOnly: this.config.requiredParamsOnly,
      acknowledgedServices: acknowledgedServices ?? this.config.acknowledgedServices,
      schemaDepth,
    });

    const historyConfig = this.config.history ? { enabled: true, ...this.config.history } : undefined;
    const historyEnabled = historyConfig?.enabled !== false;

    let delta: ReturnType<typeof compareCoverage> | undefined;
    let historyEntries: HistoryEntry[] = [];
    if (historyEnabled) {
      try {
        const prev = await loadLastEntry(outputDir, historyConfig ?? {});
        if (prev) delta = compareCoverage(coverageResult.summary, prev.summary);
        historyEntries = await loadAllEntries(outputDir, historyConfig ?? {});
      } catch (err) {
        log.warn(`Could not read history: ${(err as Error).message}`);
      }
    }

    const formats = this.config.outputFormats ?? ['console', 'json'];

    if (formats.includes('console')) {
      const consoleConfig = { enabled: true, ...this.config.consoleOutput };
      if (consoleConfig.enabled !== false) {
        await printConsoleReport(
          coverageResult,
          consoleConfig,
          this.config.threshold,
          this.config.failOnThreshold,
          delta,
          this.config.excludeDimensions
        );
      }
    }

    const outputOk: boolean[] = [];
    if (formats.includes('json')) outputOk.push(await this.emitJsonOutput(coverageResult, outputDir));
    if (formats.includes('html')) outputOk.push(await this.emitHtmlOutput(coverageResult, outputDir, historyEntries));
    if (formats.includes('badge')) outputOk.push(await this.emitBadgeOutput(coverageResult, outputDir));
    if (formats.includes('junit')) outputOk.push(await this.emitJUnitOutput(coverageResult, outputDir));
    if (formats.includes('markdown')) outputOk.push(await this.emitMarkdownOutput(coverageResult, outputDir, delta));
    if (outputOk.some((ok) => !ok)) result.outputError = true;

    if (historyEnabled) await this.saveHistoryData(coverageResult, outputDir, historyConfig ?? {});

    const violations = this.config.threshold
      ? checkThresholds(coverageResult, this.config.threshold, this.config.failOnThreshold, this.config.excludeDimensions)
      : [];

    if (isGitHubActions()) {
      if (violations.length > 0) emitAnnotations(violations);
      try {
        await writeStepSummary(
          coverageResult,
          violations,
          this.config.githubActionsOutput ?? {},
          delta,
          this.config.excludeDimensions,
        );
      } catch (err) {
        log.warn(`Could not write GitHub step summary: ${(err as Error).message}`);
      }
    }

    result.thresholdFailed = violations.some((v) => v.fail);
    return result;
  }

  private async emitJsonOutput(result: CoverageResult, outputDir: string): Promise<boolean> {
    const jsonConfig = { enabled: true, ...this.config.jsonOutput };
    if (jsonConfig.enabled === false) return true;
    try {
      const path = await writeJsonReport(result, outputDir, jsonConfig);
      log.info(`Coverage report written to ${path}`);
      return true;
    } catch (err) {
      log.error(`Failed to write JSON report: ${(err as Error).message}`);
      return false;
    }
  }

  private async emitHtmlOutput(
    result: CoverageResult,
    outputDir: string,
    historyEntries: HistoryEntry[],
  ): Promise<boolean> {
    const htmlConfig = { enabled: true, ...this.config.htmlOutput };
    if (htmlConfig.enabled === false) return true;
    try {
      const writtenPath = await writeHtmlReport(
        result,
        outputDir,
        htmlConfig,
        historyEntries,
        this.config.responsePropertiesWeight ?? 0.5,
        this.config.excludeDimensions
      );
      log.info(`HTML report written to ${writtenPath}`);
      return true;
    } catch (err) {
      log.error(`Failed to write HTML report: ${(err as Error).message}`);
      return false;
    }
  }

  private async emitBadgeOutput(result: CoverageResult, outputDir: string): Promise<boolean> {
    try {
      const path = await writeBadge(result, outputDir, this.config.badge ?? {});
      log.info(`Badge written to ${path}`);
      return true;
    } catch (err) {
      log.error(`Failed to write badge: ${(err as Error).message}`);
      return false;
    }
  }

  private async emitJUnitOutput(result: CoverageResult, outputDir: string): Promise<boolean> {
    const junitConfig = { enabled: true, ...this.config.junitOutput };
    if (junitConfig.enabled === false) return true;
    try {
      const path = await writeJUnitReport(
        result,
        outputDir,
        this.config.threshold,
        junitConfig,
        this.config.excludeDimensions
      );
      log.info(`JUnit report written to ${path}`);
      return true;
    } catch (err) {
      log.error(`Failed to write JUnit report: ${(err as Error).message}`);
      return false;
    }
  }

  private async emitMarkdownOutput(result: CoverageResult, outputDir: string, delta?: CoverageDelta): Promise<boolean> {
    const mdConfig = { enabled: true, ...this.config.markdownOutput };
    if (mdConfig.enabled === false) return true;
    try {
      const path = await writeMarkdownReport(result, outputDir, mdConfig, this.config.excludeDimensions, delta);
      log.info(`Markdown report written to ${path}`);
      return true;
    } catch (err) {
      log.error(`Failed to write Markdown report: ${(err as Error).message}`);
      return false;
    }
  }

  private async saveHistoryData(
    result: CoverageResult,
    outputDir: string,
    historyConfig: Record<string, unknown>,
  ): Promise<void> {
    try {
      await appendToHistory(result, outputDir, historyConfig);
    } catch (err) {
      log.warn(`Could not write history: ${(err as Error).message}`);
    }
  }
}
