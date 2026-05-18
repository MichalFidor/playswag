import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, MarkdownOutputConfig, CoverageDimension } from '../types.js';
import type { CoverageDelta } from './history.js';
import { activeDimensions, badgeEmoji, pct, deltaStr, escapeMarkdownBackticks } from './dimensions.js';

/**
 * Render a Markdown coverage report from a {@link CoverageResult}.
 *
 * Returns a string — no file I/O, suitable for use in tests or embedding in
 * CI tooling.
 */
export function generateMarkdownReport(
  result: CoverageResult,
  config: MarkdownOutputConfig = {},
  excludeDimensions?: CoverageDimension[],
  delta?: CoverageDelta
): string {
  const title = config.title ?? 'API Coverage Report';
  const { summary } = result;

  const dimensions = activeDimensions(excludeDimensions);
  const activeSummaryRows = dimensions.map(({ key, label, dim }) => {
    const s = summary[key];
    const d = delta?.[dim as keyof CoverageDelta];
    return `| ${label} | ${s.covered} | ${s.total} | ${badgeEmoji(s.percentage)} ${pct(s.percentage)} | ${deltaStr(d)} |`;
  });

  const lines: string[] = [
    `# ${title}`,
    '',
    `| Dimension | Covered | Total | Coverage | Change |`,
    `|-----------|--------:|------:|---------:|-------:|`,
    ...activeSummaryRows,
    '',
  ];

  // Per-tag coverage table
  const tags = Object.entries(result.tagCoverage).filter(([t]) => t !== '(untagged)');
  if (tags.length > 0) {
    lines.push('## Coverage by Tag');
    lines.push('');
    lines.push(`| Tag | ${dimensions.map((d) => d.short).join(' | ')} |`);
    lines.push(`|-----|${dimensions.map(() => '---------:').join('|')}|`);
    for (const [tag, tc] of tags) {
      const cells = dimensions.map((d) => `${badgeEmoji(tc[d.key].percentage)} ${pct(tc[d.key].percentage)}`);
      lines.push(`| \`${escapeMarkdownBackticks(tag)}\` | ${cells.join(' | ')} |`);
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
  config: MarkdownOutputConfig = {},
  excludeDimensions?: CoverageDimension[],
  delta?: CoverageDelta
): Promise<string> {
  const { fileName = 'playswag-coverage.md' } = config;
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generateMarkdownReport(result, config, excludeDimensions, delta), 'utf8');
  return outputPath;
}
