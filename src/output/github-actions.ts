import { appendFile } from 'node:fs/promises';
import type { CoverageResult } from '../types.js';
import type { ThresholdViolation } from './console.js';

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
    // GitHub Actions annotation format: ::level::message
    process.stdout.write(`::${level}::[playswag] ${v.message}\n`);
  }
}

/**
 * Write a Markdown coverage summary to the GitHub Actions Job Summary
 * (`$GITHUB_STEP_SUMMARY` environment variable), if defined.
 */
export async function writeStepSummary(
  result: CoverageResult,
  violations: ThresholdViolation[]
): Promise<void> {
  const summaryPath = process.env['GITHUB_STEP_SUMMARY'];
  if (!summaryPath) return;

  const { summary } = result;

  const badge = (pct: number) => {
    if (pct >= 80) return '🟢';
    if (pct >= 50) return '🟡';
    return '🔴';
  };

  const pct = (v: number) => `${v.toFixed(1)}%`;

  const lines: string[] = [
    '## playswag — API Coverage Report',
    '',
    `| Dimension | Covered | Total | % |`,
    `|-----------|--------:|------:|---|`,
    `| Endpoints | ${summary.endpoints.covered} | ${summary.endpoints.total} | ${badge(summary.endpoints.percentage)} ${pct(summary.endpoints.percentage)} |`,
    `| Status Codes | ${summary.statusCodes.covered} | ${summary.statusCodes.total} | ${badge(summary.statusCodes.percentage)} ${pct(summary.statusCodes.percentage)} |`,
    `| Parameters | ${summary.parameters.covered} | ${summary.parameters.total} | ${badge(summary.parameters.percentage)} ${pct(summary.parameters.percentage)} |`,
    `| Body Properties | ${summary.bodyProperties.covered} | ${summary.bodyProperties.total} | ${badge(summary.bodyProperties.percentage)} ${pct(summary.bodyProperties.percentage)} |`,
    '',
  ];

  // Per-tag table if there are tags
  const tags = Object.entries(result.tagCoverage).filter(([t]) => t !== '(untagged)');
  if (tags.length > 0) {
    lines.push('### Coverage by Tag');
    lines.push('');
    lines.push('| Tag | Endpoints | Status Codes | Parameters | Body Props |');
    lines.push('|-----|----------:|-------------:|-----------:|-----------:|');
    for (const [tag, tc] of tags) {
      lines.push(
        `| \`${tag}\` | ${badge(tc.endpoints.percentage)} ${pct(tc.endpoints.percentage)} | ${badge(tc.statusCodes.percentage)} ${pct(tc.statusCodes.percentage)} | ${badge(tc.parameters.percentage)} ${pct(tc.parameters.percentage)} | ${badge(tc.bodyProperties.percentage)} ${pct(tc.bodyProperties.percentage)} |`
      );
    }
    lines.push('');
  }

  if (violations.length > 0) {
    lines.push('### Threshold Violations');
    lines.push('');
    for (const v of violations) {
      const icon = v.fail ? '❌' : '⚠️';
      lines.push(`- ${icon} ${v.message}`);
    }
    lines.push('');
  }

  const content = lines.join('\n');

  try {
    await appendFile(summaryPath, content, 'utf8');
  } catch (err) {
    console.warn(`[playswag] Could not write to $GITHUB_STEP_SUMMARY: ${(err as Error).message}`);
  }
}
