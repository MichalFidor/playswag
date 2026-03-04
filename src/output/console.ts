import Table from 'cli-table3';
import type { CoverageResult, OperationCoverage, ConsoleOutputConfig, ThresholdConfig } from '../types.js';

type ChalkInstance = {
  green: (s: string) => string;
  red: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
};

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

/** Check whether any threshold is breached and return violation messages. */
export function checkThresholds(
  result: CoverageResult,
  threshold: ThresholdConfig
): string[] {
  const violations: string[] = [];

  const checks: [keyof ThresholdConfig, number, string][] = [
    ['endpoints', result.summary.endpoints.percentage, 'Endpoint'],
    ['statusCodes', result.summary.statusCodes.percentage, 'Status code'],
    ['parameters', result.summary.parameters.percentage, 'Parameter'],
    ['bodyProperties', result.summary.bodyProperties.percentage, 'Body property'],
  ];

  for (const [key, actual, label] of checks) {
    const min = threshold[key];
    if (min !== undefined && actual < min) {
      violations.push(`${label} coverage ${actual.toFixed(1)}% is below threshold ${min}%`);
    }
  }

  return violations;
}



/**
 * Print the Playswag coverage report to stdout.
 */
export async function printConsoleReport(
  result: CoverageResult,
  config: ConsoleOutputConfig = {},
  threshold?: ThresholdConfig,
  failOnThreshold = false
): Promise<void> {
  const c = await getChalk();
  const {
    showUncoveredOnly = false,
    showDetails = true,
    showParams = false,
    showBodyProperties = false,
  } = config;

  const divider = c.dim('─'.repeat(80));

  console.log('');
  console.log(divider);
  console.log(c.bold(c.cyan('  Playswag · API Coverage Report')));
  console.log(c.dim(`  ${result.timestamp}  ·  specs: ${result.specFiles.join(', ')}`));
  console.log(divider);


  const rows: [string, string, string, string][] = [
    [
      'Endpoints',
      `${result.summary.endpoints.covered}/${result.summary.endpoints.total}`,
      colorPercent(c, result.summary.endpoints.percentage),
      progressBar(result.summary.endpoints.percentage),
    ],
    [
      'Status Codes',
      `${result.summary.statusCodes.covered}/${result.summary.statusCodes.total}`,
      colorPercent(c, result.summary.statusCodes.percentage),
      progressBar(result.summary.statusCodes.percentage),
    ],
    [
      'Parameters',
      `${result.summary.parameters.covered}/${result.summary.parameters.total}`,
      colorPercent(c, result.summary.parameters.percentage),
      progressBar(result.summary.parameters.percentage),
    ],
    [
      'Body Props',
      `${result.summary.bodyProperties.covered}/${result.summary.bodyProperties.total}`,
      colorPercent(c, result.summary.bodyProperties.percentage),
      progressBar(result.summary.bodyProperties.percentage),
    ],
  ];

  const summaryTable = new Table({
    head: [c.bold('Dimension'), c.bold('Covered'), c.bold('%'), c.bold('Progress')],
    style: { head: [], border: [] },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│',
    },
  });

  for (const row of rows) {
    summaryTable.push(row);
  }

  console.log(summaryTable.toString());

  if (threshold) {
    const violations = checkThresholds(result, threshold);
    if (violations.length > 0) {
      console.log('');
      for (const v of violations) {
        console.log(failOnThreshold ? c.red(`  ✗ ${v}`) : c.yellow(`  ⚠ ${v}`));
      }
    } else {
      console.log(c.green('  ✓ All thresholds met'));
    }
  }

  if (!showDetails) {
    console.log(divider);
    console.log('');
    return;
  }


  const opsToShow = showUncoveredOnly
    ? result.operations.filter((o) => !o.covered)
    : result.operations;

  if (opsToShow.length === 0) {
    console.log(c.green('\n  All operations covered!\n'));
    console.log(divider);
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
      c.bold('✓'),
    ],
    colWidths: [10, 45, 30, 10, 5],
    wordWrap: true,
    style: { head: [], border: [] },
    chars: {
      'top': '─', 'top-mid': '┬', 'top-left': '┌', 'top-right': '┐',
      'bottom': '─', 'bottom-mid': '┴', 'bottom-left': '└', 'bottom-right': '┘',
      'left': '│', 'left-mid': '├', 'mid': '─', 'mid-mid': '┼',
      'right': '│', 'right-mid': '┤', 'middle': '│',
    },
  });

  for (const op of opsToShow) {
    const methodColor = op.covered ? c.green(op.method) : c.red(op.method);
    opsTable.push([
      methodColor,
      op.path,
      summaryCodes(c, op.statusCodes),
      paramRatio(op),
      colorBool(c, op.covered),
    ]);

    if (showParams && op.parameters.length > 0) {
      const paramLines = op.parameters
        .map((p) => `  ${colorBool(c, p.covered)} ${p.in}:${p.name}${p.required ? ' *' : ''}`)
        .join('\n');
      opsTable.push([{ content: paramLines, colSpan: 5 }]);
    }

    if (showBodyProperties && op.bodyProperties.length > 0) {
      const bodyLines = op.bodyProperties
        .map((b) => `  ${colorBool(c, b.covered)} body.${b.name}${b.required ? ' *' : ''}`)
        .join('\n');
      opsTable.push([{ content: bodyLines, colSpan: 5 }]);
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
  console.log(divider);
  console.log('');
}
