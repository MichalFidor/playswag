import { appendFile } from 'node:fs/promises';
import type { CoverageResult, CoverageDimension, GitHubActionsOutputConfig } from '../types.js';
import type { ThresholdViolation } from './console.js';
import type { CoverageDelta } from './history.js';
import { log } from '../log.js';
import {
  activeDimensions,
  badgeEmoji,
  pct,
  deltaStr,
  sanitizeWorkflowMessage,
  escapeMarkdownBackticks,
} from './dimensions.js';

/**
 * Whether the current process is running inside GitHub Actions.
 */
export function isGitHubActions(): boolean {
  return process.env['GITHUB_ACTIONS'] === 'true';
}

/**
 * Emit GitHub Actions workflow commands for threshold violations.
 *
 * Violations with `fail: true` are emitted as `::error::`, others as `::warning::`.
 * This causes them to appear as annotations on PR files in the Actions UI.
 */
export function emitAnnotations(violations: ThresholdViolation[]): void {
  for (const v of violations) {
    const level = v.fail ? 'error' : 'warning';
    const message = sanitizeWorkflowMessage(v.message);
    process.stdout.write(`::${level}::[playswag] ${message}\n`);
  }
}

/**
 * Write a Markdown coverage summary to the GitHub Actions Job Summary
 * (`$GITHUB_STEP_SUMMARY` environment variable), if defined.
 */
export async function writeStepSummary(
  result: CoverageResult,
  violations: ThresholdViolation[],
  config: GitHubActionsOutputConfig = {},
  delta?: CoverageDelta,
  excludeDimensions?: CoverageDimension[],
): Promise<void> {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryPath) return;

  const { summary } = result;
  const dimensions = activeDimensions(excludeDimensions);

  const lines: string[] = [
    '## playswag — API Coverage Report',
    '',
    `| Dimension | Covered | Total | % |`,
    `|-----------|--------:|------:|---|`,
  ];

  for (const { key, label, dim } of dimensions) {
    const s = summary[key];
    const d = delta?.[dim as keyof CoverageDelta];
    lines.push(`| ${label} | ${s.covered} | ${s.total} | ${badgeEmoji(s.percentage)} ${pct(s.percentage)}${deltaStr(d)} |`);
  }

  lines.push('');

  // Per-tag table if there are named tags
  const tags = Object.entries(result.tagCoverage).filter(([t]) => t !== '(untagged)');
  if (tags.length > 0) {
    const tagCols = dimensions;
    lines.push('### Coverage by Tag');
    lines.push('');
    lines.push(`| Tag | ${tagCols.map((c) => c.short).join(' | ')} |`);
    lines.push(`|-----|${tagCols.map(() => '---:').join('|')}|`);
    for (const [tag, tc] of tags) {
      const cells = tagCols.map((c) => `${badgeEmoji(tc[c.key].percentage)} ${pct(tc[c.key].percentage)}`);
      lines.push(`| \`${escapeMarkdownBackticks(tag)}\` | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }

  // Threshold violations
  if (violations.length > 0) {
    lines.push('### Threshold Violations');
    lines.push('');
    for (const v of violations) {
      const icon = v.fail ? '❌' : '⚠️';
      lines.push(`- ${icon} ${v.message}`);
    }
    lines.push('');
  }

  // Uncovered operations (opt-in)
  if (config.showUncoveredOperations && result.uncoveredOperations.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Uncovered operations (${result.uncoveredOperations.length})</summary>`);
    lines.push('');
    lines.push('| Method | Path |');
    lines.push('|--------|------|');
    for (const op of result.uncoveredOperations) {
      lines.push(`| \`${op.method.toUpperCase()}\` | \`${escapeMarkdownBackticks(op.path)}\` |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  // Unmatched hits (opt-in)
  if (config.showUnmatchedHits && result.unmatchedHits.length > 0) {
    lines.push('<details>');
    lines.push(`<summary>Unmatched API calls (${result.unmatchedHits.length})</summary>`);
    lines.push('');
    lines.push('| Method | URL | Status |');
    lines.push('|--------|-----|--------|');
    for (const hit of result.unmatchedHits) {
      lines.push(`| \`${hit.method.toUpperCase()}\` | \`${escapeMarkdownBackticks(hit.url)}\` | ${hit.statusCode} |`);
    }
    lines.push('');
    lines.push('</details>');
    lines.push('');
  }

  const content = lines.join('\n');

  try {
    await appendFile(summaryPath, content, 'utf8');
  } catch (err) {
    log.warn(`Could not write to $GITHUB_STEP_SUMMARY: ${(err as Error).message}`);
  }
}

