import Table from 'cli-table3';
import type { CoverageResult, OperationCoverage, ConsoleOutputConfig, ThresholdConfig, ThresholdEntry } from '../types.js';
import type { CoverageDelta } from './history.js';

const TABLE_CHARS = {
  'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
  'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
  'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
  'right': '│', 'right-mid': '┤', 'middle': '│',
} as const;

type ChalkInstance = {
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
};

/** A single threshold violation returned by {@link checkThresholds}. */
export interface ThresholdViolation {
  /** Human-readable description of the violation. */
  message: string;
  /**
   * Whether this violation should cause the run to fail.
   * Determined by the per-entry `fail` flag or the global `failOnThreshold` default.
   */
  fail: boolean;
}

/** Resolve a `number | ThresholdEntry` config value into `{ min, fail }` or `null`. */
function resolveEntry(
  entry: number | ThresholdEntry | undefined,
  globalFail: boolean
): { min: number; fail: boolean } | null {
  if (entry === undefined) return null;
  if (typeof entry === 'number') return { min: entry, fail: globalFail };
  return { min: entry.min, fail: entry.fail ?? globalFail };
}

let _chalk: ChalkInstance | null = null;

async function getChalk(): Promise<ChalkInstance> {
  if (_chalk) return _chalk;
  const mod = await import('chalk');
  _chalk = mod.default as unknown as ChalkInstance;
  return _chalk;
}



function progressBar(percent: number, width = 20): string {
  const filled = Math.round((percent / 100) * width);
  const empty = width - filled;
  return '█'.repeat(filled) + '░'.repeat(empty);
}

function colorPercent(c: ChalkInstance, pct: number): string {
  const s = `${pct.toFixed(1)}%`;
  if (pct >= 80) return c.green(s);
  if (pct >= 50) return c.yellow(s);
  return c.red(s);
}

function colorBool(c: ChalkInstance, val: boolean): string {
  return val ? c.green('✓') : c.red('✗');
}

function summaryCodes(c: ChalkInstance, codes: OperationCoverage['statusCodes']): string {
  return Object.entries(codes)
    .map(([code, sc]) => `${code} ${colorBool(c, sc.covered)}`)
    .join('  ');
}

function paramRatio(op: OperationCoverage): string {
  const total = op.parameters.length + op.bodyProperties.length;
  if (total === 0) return '—';
  const covered =
    op.parameters.filter((p) => p.covered).length +
    op.bodyProperties.filter((b) => b.covered).length;
  return `${covered}/${total}`;
}

function respRatio(op: OperationCoverage): string {
  const total = op.responseProperties.length;
  if (total === 0) return '—';
  const covered = op.responseProperties.filter((r) => r.covered).length;
  return `${covered}/${total}`;
}

/**
 * Check whether any threshold is breached and return structured violation objects.
 *
 * @param result     - The coverage result to check.
 * @param threshold  - Per-dimension threshold configuration.
 * @param globalFail - Default for the `fail` flag when a dimension's entry does not
 *                     specify its own value. Corresponds to `PlayswagConfig.failOnThreshold`.
 */
export function checkThresholds(
  result: CoverageResult,
  threshold: ThresholdConfig,
  globalFail = false
): ThresholdViolation[] {
  const violations: ThresholdViolation[] = [];

  const checks: [keyof ThresholdConfig, number, string][] = [
    ['endpoints', result.summary.endpoints.percentage, 'Endpoint'],
    ['statusCodes', result.summary.statusCodes.percentage, 'Status code'],
    ['parameters', result.summary.parameters.percentage, 'Parameter'],
    ['bodyProperties', result.summary.bodyProperties.percentage, 'Body property'],
    ['responseProperties', result.summary.responseProperties.percentage, 'Response property'],
  ];

  for (const [key, actual, label] of checks) {
    const resolved = resolveEntry(threshold[key], globalFail);
    if (resolved !== null && actual < resolved.min) {
      violations.push({
        message: `${label} coverage ${actual.toFixed(1)}% is below threshold ${resolved.min}%`,
        fail: resolved.fail,
      });
    }
  }

  return violations;
}



/** Format an ISO timestamp as "04 Mar 2026 · 14:18:27". */
function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour12: false });
  return `${date} · ${time}`;
}

/** Format a coverage delta as a compact trend indicator: `↑ 3.2%`, `↓ 1.1%`, or `—`. */
function formatDelta(c: ChalkInstance, delta: number | undefined): string {
  if (delta === undefined || delta === 0) return '';
  const s = `${Math.abs(delta).toFixed(1)}%`;
  return delta > 0 ? c.green(` ↑ ${s}`) : c.red(` ↓ ${s}`);
}

/**
 * Print the Playswag coverage report to stdout.
 *
 * The summary table is always shown. The operations table is controlled by
 * `config.showOperations` (default `true`).
 */
export async function printConsoleReport(
  result: CoverageResult,
  config: ConsoleOutputConfig = {},
  threshold?: ThresholdConfig,
  globalFail = false,
  delta?: CoverageDelta
): Promise<void> {
  const c = await getChalk();
  const {
    showUncoveredOnly = false,
    showOperations = true,
    showParams = false,
    showBodyProperties = false,
    showResponseProperties = false,
    showTags = false,
  } = config;

  const SEP = c.dim('─'.repeat(80));

  // ── Header ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log(SEP);
  console.log(
    `  ${c.bold(c.cyan('playswag'))}  ${c.dim('▸')}  ${c.bold('API Coverage Report')}` +
    `  ${c.dim(formatTimestamp(result.timestamp))}`
  );
  if (result.specFiles.length === 1) {
    console.log(c.dim(`  ${result.specFiles[0]}`));
  } else {
    result.specFiles.forEach((s, i) =>
      console.log(c.dim(`  ${String(i + 1).padStart(2)}.  ${s}`))
    );
  }
  console.log(SEP);
  console.log('');

  // ── Summary table (always visible) ──────────────────────────────────────────
  const rows: [string, string, string, string][] = [
    [
      'Endpoints',
      `${result.summary.endpoints.covered}/${result.summary.endpoints.total}`,
      colorPercent(c, result.summary.endpoints.percentage) + formatDelta(c, delta?.endpoints),
      progressBar(result.summary.endpoints.percentage),
    ],
    [
      'Status Codes',
      `${result.summary.statusCodes.covered}/${result.summary.statusCodes.total}`,
      colorPercent(c, result.summary.statusCodes.percentage) + formatDelta(c, delta?.statusCodes),
      progressBar(result.summary.statusCodes.percentage),
    ],
    [
      'Parameters',
      `${result.summary.parameters.covered}/${result.summary.parameters.total}`,
      colorPercent(c, result.summary.parameters.percentage) + formatDelta(c, delta?.parameters),
      progressBar(result.summary.parameters.percentage),
    ],
    [
      'Body Props',
      `${result.summary.bodyProperties.covered}/${result.summary.bodyProperties.total}`,
      colorPercent(c, result.summary.bodyProperties.percentage) + formatDelta(c, delta?.bodyProperties),
      progressBar(result.summary.bodyProperties.percentage),
    ],
    [
      'Resp Props',
      `${result.summary.responseProperties.covered}/${result.summary.responseProperties.total}`,
      colorPercent(c, result.summary.responseProperties.percentage) + formatDelta(c, delta?.responseProperties),
      progressBar(result.summary.responseProperties.percentage),
    ],
  ];

  const summaryTable = new Table({
    head: [c.bold('Dimension'), c.bold('Covered'), c.bold('%'), c.bold('Progress')],
    style: { head: [], border: [] },
    chars: TABLE_CHARS,
  });
  for (const row of rows) summaryTable.push(row);
  console.log(summaryTable.toString());

  // ── Per-tag summary ──────────────────────────────────────────────────────────
  if (showTags && result.tagCoverage && Object.keys(result.tagCoverage).length > 0) {
    console.log('');
    console.log(c.bold('  Coverage by Tag'));
    console.log('');
    const tagTable = new Table({
      head: [c.bold('Tag'), c.bold('Endpoints'), c.bold('Status Codes'), c.bold('Parameters'), c.bold('Body Props'), c.bold('Resp Props')],
      style: { head: [], border: [] },
      chars: TABLE_CHARS,
    });
    for (const [tag, tc] of Object.entries(result.tagCoverage)) {
      tagTable.push([
        tag,
        colorPercent(c, tc.endpoints.percentage),
        colorPercent(c, tc.statusCodes.percentage),
        colorPercent(c, tc.parameters.percentage),
        colorPercent(c, tc.bodyProperties.percentage),
        colorPercent(c, tc.responseProperties.percentage),
      ]);
    }
    console.log(tagTable.toString());
  }

  // ── Threshold results ────────────────────────────────────────────────────────
  if (threshold) {
    const violations = checkThresholds(result, threshold, globalFail);
    if (violations.length > 0) {
      console.log('');
      for (const v of violations) {
        // ✗ red = this violation will fail the run  |  ⚠ yellow = informational only
        console.log(v.fail ? c.red(`  ✗ ${v.message}`) : c.yellow(`  ⚠ ${v.message}`));
      }
    } else {
      console.log(c.green('  ✓ All thresholds met'));
    }
  }

  if (!showOperations) {
    console.log('');
    console.log(SEP);
    console.log('');
    return;
  }

  // ── Operations table ────────────────────────────────────────────────────────
  const opsToShow = showUncoveredOnly
    ? result.operations.filter((o) => !o.covered)
    : result.operations;

  if (opsToShow.length === 0) {
    console.log(c.green('\n  All operations covered!\n'));
    console.log(SEP);
    console.log('');
    return;
  }

  console.log('');
  console.log(c.bold('  Operations'));
  console.log('');

  const opsTable = new Table({
    head: [
      c.bold('Method'),
      c.bold('Path'),
      c.bold('Status Codes'),
      c.bold('Params'),
      c.bold('Resp Props'),
      c.bold('✓'),
    ],
    colWidths: [10, 45, 30, 10, 12, 5],
    wordWrap: true,
    style: { head: [], border: [] },
    chars: TABLE_CHARS,
  });

  for (const op of opsToShow) {
    const methodColor = op.covered ? c.green(op.method) : c.red(op.method);
    const pathLabel = op.deprecated ? `${op.path} ${c.dim('[deprecated]')}` : op.path;
    opsTable.push([
      methodColor,
      pathLabel,
      summaryCodes(c, op.statusCodes),
      paramRatio(op),
      respRatio(op),
      colorBool(c, op.covered),
    ]);

    if (showParams && op.parameters.length > 0) {
      const paramLines = op.parameters
        .map((p) => `  ${colorBool(c, p.covered)} ${p.in}:${p.name}${p.required ? ' *' : ''}`)
        .join('\n');
      opsTable.push([{ content: paramLines, colSpan: 6 }]);
    }

    if (showBodyProperties && op.bodyProperties.length > 0) {
      const bodyLines = op.bodyProperties
        .map((b) => `  ${colorBool(c, b.covered)} body.${b.name}${b.required ? ' *' : ''}`)
        .join('\n');
      opsTable.push([{ content: bodyLines, colSpan: 6 }]);
    }

    if (showResponseProperties && op.responseProperties.length > 0) {
      const grouped = new Map<string, typeof op.responseProperties>();
      for (const r of op.responseProperties) {
        if (!grouped.has(r.statusCode)) grouped.set(r.statusCode, []);
        grouped.get(r.statusCode)!.push(r);
      }
      const lines: string[] = [];
      for (const [code, props] of grouped) {
        lines.push(`  ${c.dim(code)}:`);
        for (const r of props) {
          lines.push(`    ${colorBool(c, r.covered)} resp.${r.name}${r.required ? ' *' : ''}`);
        }
      }
      opsTable.push([{ content: lines.join('\n'), colSpan: 6 }]);
    }
  }

  console.log(opsTable.toString());

  if (result.unmatchedHits.length > 0) {
    console.log('');
    console.log(
      c.yellow(`  ⚠ ${result.unmatchedHits.length} recorded API call(s) did not match any spec operation:`)
    );
    for (const hit of result.unmatchedHits.slice(0, 10)) {
      console.log(c.dim(`    ${hit.method} ${hit.url} [${hit.statusCode}]`));
    }
    if (result.unmatchedHits.length > 10) {
      console.log(c.dim(`    … and ${result.unmatchedHits.length - 10} more`));
    }
  }

  console.log('');
  console.log(SEP);
  console.log('');
}
