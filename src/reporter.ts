import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
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
import { ATTACHMENT_NAME } from './constants.js';
import { parseSpecs } from './openapi/parser.js';
import { calculateCoverage } from './coverage/calculator.js';
import { printConsoleReport, checkThresholds } from './output/console.js';
import { writeJsonReport } from './output/json.js';



function tryReadVersion(packageName: string): string {
  try {
    const require = createRequire(import.meta.url);
    const pkg: { version?: string } = require(`${packageName}/package.json`);
    return pkg.version ?? 'unknown';
  } catch {
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
    } catch {
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
 *   ['playswag/reporter', {
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

      for (const hit of hits) {
        if (!hit.testFile) hit.testFile = test.location.file;
        if (!hit.testTitle) hit.testTitle = test.title;
      }

      this.aggregatedHits.push(...hits);
    }
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] } | void> {
    if (this.aggregatedHits.length === 0 && !this.config.specs) {
      return;
    }

    let spec;
    try {
      spec = await parseSpecs(this.config.specs);
    } catch (err) {
      console.error(`[playswag] Could not parse spec(s): ${(err as Error).message}`);
      return;
    }

    if (spec.operations.length === 0) {
      console.warn('[playswag] No operations found in the provided spec(s). Coverage cannot be calculated.');
      return;
    }

    const filteredHits = this.filterHits(this.aggregatedHits);

    const coverageResult = calculateCoverage(filteredHits, spec, {
      baseURL: this.baseURL,
      playwrightVersion: tryReadVersion('@playwright/test'),
      playswagVersion: readPlayswagVersion(),
      totalTestCount: this.totalTestCount,
    });

    const formats = this.config.outputFormats;

    if (formats.includes('console')) {
      const consoleConfig = { enabled: true, ...this.config.consoleOutput };
      if (consoleConfig.enabled !== false) {
        await printConsoleReport(
          coverageResult,
          consoleConfig,
          this.config.threshold,
          this.config.failOnThreshold
        );
      }
    }

    if (formats.includes('json')) {
      const jsonConfig = { enabled: true, ...this.config.jsonOutput };
      if (jsonConfig.enabled !== false) {
        try {
          const path = await writeJsonReport(
            coverageResult,
            this.config.outputDir,
            jsonConfig
          );
          console.log(`[playswag] Coverage report written to ${path}`);
        } catch (err) {
          console.error(`[playswag] Failed to write JSON report: ${(err as Error).message}`);
        }
      }
    }

    if (this.config.failOnThreshold && this.config.threshold) {
      const violations = checkThresholds(coverageResult, this.config.threshold);
      if (violations.length > 0) {
        return { status: 'failed' };
      }
    }
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
