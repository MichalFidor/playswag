import type { CoverageDimension, CoverageSummary } from '../types.js';

export interface DimensionMeta {
  key: keyof CoverageSummary;
  label: string;
  short: string;
  dim: CoverageDimension;
}

export const ALL_DIMENSIONS: DimensionMeta[] = [
  { key: 'endpoints', label: 'Endpoints', short: 'Endpoints', dim: 'endpoints' },
  { key: 'statusCodes', label: 'Status Codes', short: 'Status Codes', dim: 'statusCodes' },
  { key: 'parameters', label: 'Parameters', short: 'Parameters', dim: 'parameters' },
  { key: 'bodyProperties', label: 'Body Properties', short: 'Body Props', dim: 'bodyProperties' },
  { key: 'responseProperties', label: 'Response Properties', short: 'Resp Props', dim: 'responseProperties' },
];

export function activeDimensions(excludeDimensions?: CoverageDimension[]): DimensionMeta[] {
  const excluded = new Set(excludeDimensions ?? []);
  return ALL_DIMENSIONS.filter((d) => !excluded.has(d.dim));
}

export function pct(v: number): string {
  return `${v.toFixed(1)}%`;
}

export function badgeEmoji(pct: number): string {
  if (pct >= 80) return '🟢';
  if (pct >= 50) return '🟡';
  return '🔴';
}

export function deltaStr(d: number | undefined): string {
  if (d === undefined || d === 0) return '';
  return d > 0 ? ` ↑${d.toFixed(1)}%` : ` ↓${Math.abs(d).toFixed(1)}%`;
}

/** Escape user content embedded in GitHub Actions workflow commands. */
export function sanitizeWorkflowMessage(message: string): string {
  return message.replace(/[\r\n]/g, ' ').replace(/::/g, ' ');
}

/** Escape backticks in Markdown inline code. */
export function escapeMarkdownBackticks(s: string): string {
  return String(s).replace(/`/g, '\\`');
}
