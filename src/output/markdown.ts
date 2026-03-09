import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, MarkdownOutputConfig } from '../types.js';

function badge(pct: number): string {
  if (pct >= 80) return '🟢';
  if (pct >= 50) return '🟡';
  return '🔴';
}

function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

/**
 * Render a Markdown coverage report from a {@link CoverageResult}.
 *
 * Returns a string — no file I/O, suitable for use in tests or embedding in
 * CI tooling.
 */
export function generateMarkdownReport(
  result: CoverageResult,
  config: MarkdownOutputConfig = {}
): string {
  const title = config.title ?? 'API Coverage Report';
  const { summary } = result;

  const lines: string[] = [
    `# ${title}`,
    '',
    `| Dimension | Covered | Total | Coverage |`,
    `|-----------|--------:|------:|---------:|`,
    `| Endpoints | ${summary.endpoints.covered} | ${summary.endpoints.total} | ${badge(summary.endpoints.percentage)} ${pct(summary.endpoints.percentage)} |`,
    `| Status Codes | ${summary.statusCodes.covered} | ${summary.statusCodes.total} | ${badge(summary.statusCodes.percentage)} ${pct(summary.statusCodes.percentage)} |`,
    `| Parameters | ${summary.parameters.covered} | ${summary.parameters.total} | ${badge(summary.parameters.percentage)} ${pct(summary.parameters.percentage)} |`,
    `| Body Properties | ${summary.bodyProperties.covered} | ${summary.bodyProperties.total} | ${badge(summary.bodyProperties.percentage)} ${pct(summary.bodyProperties.percentage)} |`,
    `| Response Properties | ${summary.responseProperties.covered} | ${summary.responseProperties.total} | ${badge(summary.responseProperties.percentage)} ${pct(summary.responseProperties.percentage)} |`,
    '',
  ];

  // Per-tag coverage table
  const tags = Object.entries(result.tagCoverage).filter(([t]) => t !== '(untagged)');
  if (tags.length > 0) {
    lines.push('## Coverage by Tag');
    lines.push('');
    lines.push('| Tag | Endpoints | Status Codes | Parameters | Body Props | Resp Props |');
    lines.push('|-----|----------:|-------------:|-----------:|-----------:|-----------:|');
    for (const [tag, tc] of tags) {
      lines.push(
        `| \`${tag}\` | ${badge(tc.endpoints.percentage)} ${pct(tc.endpoints.percentage)} | ${badge(tc.statusCodes.percentage)} ${pct(tc.statusCodes.percentage)} | ${badge(tc.parameters.percentage)} ${pct(tc.parameters.percentage)} | ${badge(tc.bodyProperties.percentage)} ${pct(tc.bodyProperties.percentage)} | ${badge(tc.responseProperties.percentage)} ${pct(tc.responseProperties.percentage)} |`
      );
    }
    lines.push('');
  }

  // Uncovered operations table
  if (config.showUncoveredOperations !== false) {
    const uncovered = result.operations.filter((op) => !op.covered);
    if (uncovered.length > 0) {
      lines.push('## Uncovered Operations');
      lines.push('');
      lines.push('| Method | Path |');
      lines.push('|--------|------|');
      for (const op of uncovered) {
        lines.push(`| \`${op.method}\` | \`${op.path}\` |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Write a Markdown coverage report to disk.
 *
 * @returns The absolute path of the written file.
 */
export async function writeMarkdownReport(
  result: CoverageResult,
  outputDir: string,
  config: MarkdownOutputConfig = {}
): Promise<string> {
  const { fileName = 'playswag-coverage.md' } = config;
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generateMarkdownReport(result, config), 'utf8');
  return outputPath;
}
