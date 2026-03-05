import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverageResult, HtmlOutputConfig, OperationCoverage } from '../types.js';
import type { HistoryEntry } from './history.js';
import { log } from '../log.js';

async function loadLogoDataUrl(): Promise<string> {
  try {
    const assetPath = fileURLToPath(new URL('../../assets/logo.png', import.meta.url));
    const buf = await readFile(assetPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (err) {
    log.warn(`Could not load logo asset: ${(err as Error).message}`);
    return '';
  }
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sparklineSvg(values: number[], cls: string): string {
  if (values.length < 2) return '';
  const W = 88, H = 24, pad = 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (W - 2 * pad);
    const y = H - pad - (Math.max(0, Math.min(v, 100)) / 100) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true"><polyline class="spark-line ${cls}" points="${pts}" /></svg>`;
}

function summaryCard(
  label: string, covered: number, total: number, pct: number,
  sparkValues?: number[]
): string {
  const cls = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
  const spark = sparkValues && sparkValues.length >= 2 ? sparklineSvg(sparkValues, cls) : '';
  return `<div class="card ${cls}">
      <div class="card-label">${esc(label)}</div>
      <div class="card-row">
        <span class="card-fraction">${covered}<span class="card-denom">/${total}</span></span>
        <span class="card-pct ${cls}">${pct.toFixed(1)}%</span>
      </div>
      <div class="bar-wrap"><div class="bar ${cls}" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
      ${spark}
    </div>`;
}

function statusCodeBadges(op: OperationCoverage): string {
  const entries = Object.entries(op.statusCodes);
  if (entries.length === 0) return '<em class="muted">none defined</em>';
  return entries.map(([code, sc]) =>
    `<span class="badge ${sc.covered ? 'green' : 'red'}">${esc(code)}</span>`
  ).join(' ');
}

function paramBadges(op: OperationCoverage): string {
  if (op.parameters.length === 0) return '<em class="muted">none</em>';
  return op.parameters.map((p) => {
    const cls = p.covered ? 'green' : (p.required ? 'red' : 'grey');
    return `<span class="badge ${cls}" title="${esc(p.in)}">${esc(p.in[0]!.toUpperCase())}:${esc(p.name)}${p.required ? '*' : ''}</span>`;
  }).join(' ');
}

function bodyBadges(op: OperationCoverage): string {
  if (op.bodyProperties.length === 0) return '<em class="muted">none</em>';
  return op.bodyProperties.map((b) => {
    const cls = b.covered ? 'green' : (b.required ? 'red' : 'grey');
    return `<span class="badge ${cls}">${esc(b.name)}${b.required ? '*' : ''}</span>`;
  }).join(' ');
}

function responseBadges(op: OperationCoverage): string {
  if (op.responseProperties.length === 0) return '<em class="muted">none</em>';
  return op.responseProperties.map((r) => {
    const cls = r.covered ? 'green' : (r.required ? 'red' : 'grey');
    return `<span class="badge ${cls}" title="${esc(r.statusCode)}">${esc(r.name)}${r.required ? '*' : ''}</span>`;
  }).join(' ');
}

/** Combined coverage percentage for a single operation across all sub-dimensions. */
function operationCoveragePct(op: OperationCoverage): number {
  const scCovered = Object.values(op.statusCodes).filter((s) => s.covered).length;
  const scTotal = Object.keys(op.statusCodes).length;
  const paramCovered = op.parameters.filter((p) => p.covered).length
    + op.bodyProperties.filter((b) => b.covered).length;
  const paramTotal = op.parameters.length + op.bodyProperties.length;
  const respCovered = op.responseProperties.filter((r) => r.covered).length;
  const respTotal = op.responseProperties.length;
  const numerator = scCovered + paramCovered + respCovered;
  const denominator = scTotal + paramTotal + respTotal;
  return denominator === 0 ? (op.covered ? 100 : 0) : (numerator / denominator) * 100;
}

function miniProgressBar(pct: number, covered: boolean): string {
  const cls = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';
  const icon = covered ? '<span class="tick green">✓</span>' : '<span class="tick red">✗</span>';
  return `<div class="mini-bar-wrap">
          <div class="mini-bar-track"><div class="mini-bar ${cls}" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>
          ${icon}
        </div>`;
}

function operationDetailRow(op: OperationCoverage, i: number, gid: number): string {
  const tags = (op.tags ?? []).join(',');
  const scCovered = Object.values(op.statusCodes).filter((s) => s.covered).length;
  const scTotal = Object.keys(op.statusCodes).length;
  const paramTotal = op.parameters.length + op.bodyProperties.length;
  const paramCovered = op.parameters.filter((p) => p.covered).length
    + op.bodyProperties.filter((b) => b.covered).length;
  const paramRatio = paramTotal === 0 ? '<span class="muted">—</span>' : `${paramCovered}/${paramTotal}`;
  const testRefsHtml = op.testRefs.length > 0
    ? op.testRefs.map((r) => `<span class="testref">${esc(r)}</span>`).join('')
    : '<em class="muted">none</em>';
  const tagBadges = (op.tags ?? []).length > 0
    ? (op.tags ?? []).map((t) => `<span class="tag-badge">${esc(t)}</span>`).join('')
    : '';
  const covPct = operationCoveragePct(op);

  return `<tr class="op-row" data-covered="${op.covered}" data-tags="${esc(tags)}" data-idx="${i}" data-gid="${gid}">
        <td class="td-method"><span class="method m-${op.method.toLowerCase()}">${esc(op.method)}</span></td>
        <td class="td-path">
          <span class="path-text">${esc(op.path)}</span>
          ${op.operationId ? `<span class="opid">${esc(op.operationId)}</span>` : ''}
          ${tagBadges ? `<span class="tag-wrap">${tagBadges}</span>` : ''}
        </td>
        <td class="td-center">${scCovered}/${scTotal}</td>
        <td class="td-center">${paramRatio}</td>
        <td class="td-coverage">${miniProgressBar(covPct, op.covered)}</td>
        <td class="td-chevron"><span class="chevron" id="chev-${i}">›</span></td>
      </tr>
      <tr class="op-detail" id="detail-${i}" data-gid="${gid}">
        <td colspan="6">
          <div class="detail-inner">
            <div class="detail-section">
              <div class="detail-label">Status Codes</div>
              <div class="detail-content">${statusCodeBadges(op)}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">Parameters</div>
              <div class="detail-content">${paramBadges(op)}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">Body Properties</div>
              <div class="detail-content">${bodyBadges(op)}</div>
            </div>
            <div class="detail-section">
              <div class="detail-label">Response Properties</div>
              <div class="detail-content">${responseBadges(op)}</div>
            </div>
            <div class="detail-section detail-tests">
              <div class="detail-label">Tests <span class="detail-count">${op.testRefs.length}</span></div>
              <div class="detail-content">${testRefsHtml}</div>
            </div>
          </div>
        </td>
      </tr>`;
}

/**
 * Renders operations grouped by their first tag (alphabetical), with a
 * collapsible group-header row before each group. Tagless operations appear
 * last under a "General" group.
 */
function tagGroupedRows(ops: OperationCoverage[]): string {
  const opIndexMap = new Map(ops.map((op, i) => [op, i]));

  const groups = new Map<string, OperationCoverage[]>();
  for (const op of ops) {
    const tag = (op.tags && op.tags.length > 0) ? op.tags[0]! : '__general__';
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag)!.push(op);
  }

  const sortedTags = [...groups.keys()].sort((a, b) => {
    if (a === '__general__') return 1;
    if (b === '__general__') return -1;
    return a.localeCompare(b);
  });

  const rows: string[] = [];
  let gid = 0;

  for (const tag of sortedTags) {
    const groupOps = groups.get(tag)!;
    const displayTag = tag === '__general__' ? 'General' : tag;
    const covered = groupOps.filter((op) => op.covered).length;
    const total = groupOps.length;
    const pct = total > 0 ? (covered / total) * 100 : 0;
    const cls = pct >= 80 ? 'green' : pct >= 50 ? 'yellow' : 'red';

    rows.push(`<tr class="tag-group-header" data-gid="${gid}">
        <td colspan="6">
          <div class="group-inner">
            <span class="group-chev open" id="gchev-${gid}">›</span>
            <span class="group-name">${esc(displayTag)}</span>
            <span class="count">${covered}/${total}</span>
            <div class="group-mini-bar"><div class="group-mini-fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
            <span class="group-pct ${cls}">${pct.toFixed(0)}%</span>
          </div>
        </td>
      </tr>`);

    for (const op of groupOps) {
      rows.push(operationDetailRow(op, opIndexMap.get(op)!, gid));
    }

    gid++;
  }

  return rows.join('\n  ');
}

function tagFilterButtons(ops: OperationCoverage[]): string {
  const seen = new Set<string>();
  for (const op of ops) {
    for (const tag of op.tags ?? []) seen.add(tag);
  }
  return [...seen].sort().map((t) =>
    `<button class="filter-btn" data-filter="tag:${esc(t)}">${esc(t)}</button>`
  ).join('\n        ');
}

function unmatchedSection(result: CoverageResult): string {
  if (result.unmatchedHits.length === 0) return '';
  const rows = result.unmatchedHits.map((h) =>
    `<tr>
      <td class="td-method"><span class="method m-${h.method.toLowerCase()}">${esc(h.method)}</span></td>
      <td class="td-mono">${esc(h.url)}</td>
      <td class="td-center"><span class="status-code">${h.statusCode}</span></td>
      <td class="td-test">${esc(h.testTitle)}</td>
    </tr>`
  ).join('\n        ');
  return `<div class="section section-warn">
    <div class="section-head">
      <div class="section-head-left">
        <span class="warn-icon">⚠</span>
        <span class="section-title">Unmatched Hits</span>
        <span class="count">${result.unmatchedHits.length}</span>
      </div>
      <span class="muted section-hint">Recorded calls that matched no spec operation</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Method</th><th>URL</th><th style="text-align:center">Status</th><th>Test</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

/**
 * Generate a standalone HTML coverage report string.
 * Pure function — no I/O, easy to snapshot-test.
 * Pass a logoDataUrl for the embedded logo (omit or pass '' to skip).
 * Pass historyEntries to render sparkline trend charts in the summary cards.
 */
export function generateHtmlReport(
  result: CoverageResult,
  config: HtmlOutputConfig = {},
  logoDataUrl = '',
  historyEntries: HistoryEntry[] = []
): string {
  const title = config.title ?? 'API Coverage Report';
  const d = new Date(result.timestamp);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour12: false });

  const logoHtml = logoDataUrl
    ? `<img src="${logoDataUrl}" alt="playswag logo" class="logo" width="64" height="64">`
    : '';

  // Overall score: average of all five percentages
  const overallPct = (
    result.summary.endpoints.percentage +
    result.summary.statusCodes.percentage +
    result.summary.parameters.percentage +
    result.summary.bodyProperties.percentage +
    result.summary.responseProperties.percentage
  ) / 5;

  const css = `
:root {
  --bg: #f4f6f9;
  --surface: #ffffff;
  --surface2: #f8f9fc;
  --border: #e3e7ef;
  --border2: #d0d7e3;
  --text: #1e2433;
  --text2: #3d4663;
  --muted: #7c8aaa;
  --green: #16a34a;
  --green-bg: #dcfce7;
  --yellow: #d97706;
  --yellow-bg: #fef3c7;
  --red: #dc2626;
  --red-bg: #fee2e2;
  --blue: #2563eb;
  --blue-bg: #dbeafe;
  --grey: #94a3b8;
  --grey-bg: #f1f5f9;
  --purple: #7c3aed;
  --warn-bg: #fffbeb;
  --warn-border: #f59e0b;
  --shadow: 0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04);
  --shadow-md: 0 4px 6px rgba(0,0,0,.05), 0 2px 4px rgba(0,0,0,.04);
  --radius: 10px;
}
[data-theme=dark] {
  --bg: #0f1117;
  --surface: #1a1e2a;
  --surface2: #141720;
  --border: #2a2f3f;
  --border2: #353b50;
  --text: #e8ecf4;
  --text2: #9aa3be;
  --muted: #5e6a88;
  --green: #22c55e;
  --green-bg: #052e16;
  --yellow: #f59e0b;
  --yellow-bg: #261a00;
  --red: #ef4444;
  --red-bg: #2d0a0a;
  --blue: #3b82f6;
  --blue-bg: #0c1a3b;
  --grey-bg: #1e2433;
  --warn-bg: #1c1500;
  --warn-border: #d97706;
  --shadow: 0 1px 3px rgba(0,0,0,.3);
  --shadow-md: 0 4px 6px rgba(0,0,0,.3);
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); font-size: 14px; line-height: 1.6; }

/* ── Accent bar ── */
.accent-bar { height: 3px; background: linear-gradient(90deg, #2563eb 0%, #7c3aed 100%); }

/* ── Header ── */
header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; box-shadow: var(--shadow); position: sticky; top: 3px; z-index: 100; }
.header-left { display: flex; align-items: center; gap: 14px; }
.logo { border-radius: 8px; flex-shrink: 0; }
.header-brand { display: flex; flex-direction: column; gap: 2px; }
.brand-name { font-size: 22px; font-weight: 800; color: var(--blue); letter-spacing: -.5px; line-height: 1.1; }
.brand-subtitle { font-size: 13px; color: var(--text2); font-weight: 500; line-height: 1.3; }
.theme-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; color: var(--text2); font-size: 12px; font-weight: 500; transition: all .15s; white-space: nowrap; }
.theme-btn:hover { border-color: var(--blue); color: var(--blue); }
/* ── Meta bar ── */
.meta-bar { background: var(--surface2); border-bottom: 1px solid var(--border); padding: 8px 32px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta-pill { display: inline-flex; align-items: center; gap: 4px; background: var(--surface); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 11px; color: var(--muted); white-space: nowrap; }
.meta-pill code { background: none; font-family: ui-monospace, monospace; color: var(--text2); font-size: 11px; }

/* ── Main ── */
main { max-width: 1280px; margin: 0 auto; padding: 28px 32px; }

/* ── Score bar ── */
.score-bar { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 24px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px; box-shadow: var(--shadow); }
.score-label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 600; white-space: nowrap; }
.score-track { flex: 1; background: var(--border); border-radius: 6px; height: 8px; overflow: hidden; }
.score-fill { height: 8px; border-radius: 6px; transition: width .6s ease; }
.score-fill.green { background: var(--green); }
.score-fill.yellow { background: var(--yellow); }
.score-fill.red { background: var(--red); }
.score-pct { font-size: 15px; font-weight: 700; white-space: nowrap; }
.score-pct.green { color: var(--green); }
.score-pct.yellow { color: var(--yellow); }
.score-pct.red { color: var(--red); }

/* ── Summary cards ── */
.summary { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; box-shadow: var(--shadow); border-left: 4px solid var(--border2); }
.card.green { border-left-color: var(--green); }
.card.yellow { border-left-color: var(--yellow); }
.card.red { border-left-color: var(--red); }
.card-label { font-size: 11px; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); margin-bottom: 8px; font-weight: 600; }
.card-row { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 10px; gap: 8px; }
.card-fraction { font-size: 22px; font-weight: 800; color: var(--text); }
.card-denom { font-size: 14px; font-weight: 400; color: var(--muted); }
.card-pct { font-size: 22px; font-weight: 800; }
.card-pct.green { color: var(--green); }
.card-pct.yellow { color: var(--yellow); }
.card-pct.red { color: var(--red); }
.bar-wrap { background: var(--border); border-radius: 4px; height: 5px; overflow: hidden; }
.bar { height: 5px; border-radius: 4px; }
.bar.green { background: var(--green); }
.bar.yellow { background: var(--yellow); }
.bar.red { background: var(--red); }

/* ── Section ── */
.section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 20px; overflow: hidden; box-shadow: var(--shadow); }
.section-warn { border-color: var(--warn-border); background: var(--warn-bg); }
.section-head { padding: 14px 20px; border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.section-head-left { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.section-title { font-size: 14px; font-weight: 700; color: var(--text); }
.section-hint { font-size: 12px; color: var(--muted); }
.warn-icon { font-size: 16px; }
.count { background: var(--border); border-radius: 20px; padding: 1px 9px; font-size: 11px; font-weight: 700; color: var(--text2); }
.filter-bar { display: flex; gap: 6px; flex-wrap: wrap; }
.filter-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 4px 13px; cursor: pointer; font-size: 12px; font-weight: 500; color: var(--text2); transition: all .15s; }
.filter-btn.active, .filter-btn:hover { background: var(--blue); border-color: var(--blue); color: #fff; }

/* ── Table ── */
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; padding: 10px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); border-bottom: 1px solid var(--border); background: var(--surface2); white-space: nowrap; font-weight: 600; }
.op-row td { padding: 11px 16px; border-bottom: 1px solid var(--border); vertical-align: middle; cursor: pointer; color: var(--text); transition: background .1s; }
.op-row:hover td { background: var(--surface2); }
.op-row.hidden { display: none; }
.op-row[data-covered="false"] .path-text { color: var(--muted); }
.op-detail { display: none; }
.op-detail.open { display: table-row; }
.op-detail td { padding: 0; border-bottom: 1px solid var(--border); background: var(--surface2); }

/* ── Detail inner ── */
.detail-inner { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 0; border-top: 2px solid var(--blue); }
.detail-section { padding: 14px 18px; border-right: 1px solid var(--border); }
.detail-section:last-child { border-right: none; }
.detail-tests { grid-column: span 1; }
.detail-label { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 8px; font-weight: 700; display: flex; align-items: center; gap: 6px; }
.detail-count { background: var(--border); border-radius: 10px; padding: 0 6px; font-size: 10px; font-weight: 700; color: var(--text2); }
.detail-content { display: flex; flex-wrap: wrap; gap: 4px; }

/* ── Method badges ── */
.method { display: inline-flex; align-items: center; justify-content: center; min-width: 54px; padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; color: #fff; font-family: ui-monospace, monospace; letter-spacing: .03em; }
.m-get { background: #16a34a; }
.m-post { background: #2563eb; }
.m-put { background: #d97706; }
.m-patch { background: #7c3aed; }
.m-delete { background: #dc2626; }
.m-head, .m-options, .m-trace { background: #64748b; }

/* ── Cells ── */
.td-method { width: 72px; }
.td-path { font-family: ui-monospace, monospace; word-break: break-word; }
.path-text { display: block; font-size: 13px; }
.opid { display: inline-block; font-size: 10px; color: var(--muted); margin-top: 2px; margin-right: 4px; }
.tag-wrap { display: inline-flex; flex-wrap: wrap; gap: 3px; margin-top: 3px; }
.tag-badge { background: var(--blue-bg); color: var(--blue); border-radius: 10px; padding: 1px 7px; font-size: 10px; font-family: ui-sans-serif, system-ui, sans-serif; font-weight: 600; }
.td-center { text-align: center; white-space: nowrap; color: var(--text2); font-size: 13px; }
.td-mono { font-family: ui-monospace, monospace; word-break: break-all; font-size: 12px; }
.td-test { color: var(--text2); font-size: 12px; }
.td-chevron { width: 28px; text-align: right; }
.chevron { display: inline-block; font-size: 18px; color: var(--muted); line-height: 1; transition: transform .2s; font-style: normal; user-select: none; }
.chevron.open { transform: rotate(90deg); }
.status-code { background: var(--grey-bg); border-radius: 4px; padding: 2px 7px; font-family: ui-monospace, monospace; font-size: 12px; }

/* ── Coverage badges ── */
.badge { display: inline-flex; align-items: center; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 600; font-family: ui-monospace, monospace; border: 1px solid transparent; }
.badge.green { background: var(--green-bg); color: var(--green); border-color: color-mix(in srgb, var(--green) 20%, transparent); }
.badge.red { background: var(--red-bg); color: var(--red); border-color: color-mix(in srgb, var(--red) 20%, transparent); }
.badge.yellow { background: var(--yellow-bg); color: var(--yellow); }
.badge.grey { background: var(--grey-bg); color: var(--muted); }

/* ── Test refs ── */
.testref { display: inline-block; background: var(--border); color: var(--text2); border-radius: 4px; padding: 2px 8px; font-size: 11px; font-family: ui-monospace, monospace; }

/* ── Tick ── */
.tick { font-size: 16px; font-weight: 800; }
.tick.green { color: var(--green); }
.tick.red { color: var(--red); }

/* ── Sparklines ── */
.sparkline { display: block; margin-top: 6px; overflow: visible; }
.spark-line { fill: none; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.spark-line.green { stroke: var(--green); opacity: .55; }
.spark-line.yellow { stroke: var(--yellow); opacity: .55; }
.spark-line.red { stroke: var(--red); opacity: .55; }

/* ── Tag group headers ── */
.tag-group-header { cursor: pointer; user-select: none; }
.tag-group-header td { padding: 0; }
.group-inner { display: flex; align-items: center; gap: 10px; padding: 9px 16px; background: var(--surface2); border-bottom: 1px solid var(--border); border-left: 3px solid var(--border2); transition: background .1s; }
.tag-group-header:hover .group-inner { background: var(--border); }
.tag-group-header.collapsed .group-inner { border-left-color: var(--muted); }
.group-chev { font-size: 15px; color: var(--muted); transition: transform .2s; display: inline-block; line-height: 1; }
.group-chev.open { transform: rotate(90deg); }
.group-name { font-size: 11px; font-weight: 700; color: var(--text2); text-transform: uppercase; letter-spacing: .07em; }
.group-mini-bar { flex: 1; max-width: 100px; background: var(--border); border-radius: 3px; height: 4px; overflow: hidden; }
.group-mini-fill { height: 4px; border-radius: 3px; }
.group-mini-fill.green { background: var(--green); }
.group-mini-fill.yellow { background: var(--yellow); }
.group-mini-fill.red { background: var(--red); }
.group-pct { font-size: 11px; font-weight: 700; white-space: nowrap; }
.group-pct.green { color: var(--green); }
.group-pct.yellow { color: var(--yellow); }
.group-pct.red { color: var(--red); }

/* ── Per-operation mini progress bar ── */
.td-coverage { text-align: center; white-space: nowrap; }
.mini-bar-wrap { display: inline-flex; align-items: center; gap: 6px; }
.mini-bar-track { width: 56px; background: var(--border); border-radius: 3px; height: 5px; overflow: hidden; }
.mini-bar { height: 5px; border-radius: 3px; }
.mini-bar.green { background: var(--green); }
.mini-bar.yellow { background: var(--yellow); }
.mini-bar.red { background: var(--red); }

/* ── Card hover ── */
.card { transition: box-shadow .15s, transform .15s; }
.card:hover { box-shadow: var(--shadow-md); transform: translateY(-1px); }

/* ── Misc ── */
.muted { color: var(--muted); }
.green { color: var(--green); }
.yellow { color: var(--yellow); }
.red { color: var(--red); }

/* ── Footer ── */
footer { text-align: center; padding: 24px 32px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 12px; }
.footer-logo { opacity: .5; border-radius: 4px; }

/* ── Responsive ── */
@media(max-width: 900px) { main { padding: 16px; } header { padding: 14px 16px; } }
@media(max-width: 480px) { .summary { grid-template-columns: 1fr; } .meta-bar { display: none; } .detail-inner { grid-template-columns: 1fr; } }`.trim();

  const js = `
(function(){
  var btn=document.getElementById('theme-btn');
  var html=document.documentElement;
  var dark=localStorage.getItem('playswag-theme')==='dark';
  function applyTheme(d){dark=d;html.setAttribute('data-theme',d?'dark':'light');btn.textContent=d?'☀ Light':'🌙 Dark';localStorage.setItem('playswag-theme',d?'dark':'light');}
  applyTheme(dark);
  btn.addEventListener('click',function(){applyTheme(!dark);});

  // Tag group collapse
  document.querySelectorAll('.tag-group-header').forEach(function(header){
    header.addEventListener('click',function(){
      var gid=header.getAttribute('data-gid');
      var collapsed=header.classList.toggle('collapsed');
      var chev=document.getElementById('gchev-'+gid);
      if(chev)chev.classList.toggle('open',!collapsed);
      // Toggle op-rows and op-detail rows belonging to this group
      document.querySelectorAll('.op-row[data-gid="'+gid+'"]').forEach(function(row){
        row.classList.toggle('hidden',collapsed);
        if(collapsed){
          var idx=row.getAttribute('data-idx');
          var det=document.getElementById('detail-'+idx);
          var ch=document.getElementById('chev-'+idx);
          if(det){det.classList.remove('open');}
          if(ch){ch.classList.remove('open');}
        }
      });
      document.querySelectorAll('.op-detail[data-gid="'+gid+'"]').forEach(function(det){
        if(collapsed)det.classList.remove('open');
      });
    });
  });

  // Filter buttons — applying a filter expands all groups first
  var filterBtns=document.querySelectorAll('.filter-btn');
  var opRows=document.querySelectorAll('.op-row');
  filterBtns.forEach(function(b){
    b.addEventListener('click',function(){
      filterBtns.forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      var f=b.getAttribute('data-filter');
      // Expand all groups before filtering
      document.querySelectorAll('.tag-group-header').forEach(function(h){
        h.classList.remove('collapsed');
        var gid=h.getAttribute('data-gid');
        var chev=document.getElementById('gchev-'+gid);
        if(chev)chev.classList.add('open');
      });
      opRows.forEach(function(row){
        var show=f==='all'||
          (f==='covered'&&row.getAttribute('data-covered')==='true')||
          (f==='uncovered'&&row.getAttribute('data-covered')==='false')||
          (f.startsWith('tag:')&&row.getAttribute('data-tags').split(',').indexOf(f.slice(4))!==-1);
        row.classList.toggle('hidden',!show);
        var idx=row.getAttribute('data-idx');
        var det=document.getElementById('detail-'+idx);
        var ch=document.getElementById('chev-'+idx);
        if(det&&!show){det.classList.remove('open');}
      });
      // Hide group headers that have no visible rows
      document.querySelectorAll('.tag-group-header').forEach(function(header){
        var gid=header.getAttribute('data-gid');
        var anyVisible=false;
        document.querySelectorAll('.op-row[data-gid="'+gid+'"]').forEach(function(row){
          if(!row.classList.contains('hidden'))anyVisible=true;
        });
        header.classList.toggle('hidden',!anyVisible);
      });
    });
  });

  // Operation row expand
  opRows.forEach(function(row){
    row.addEventListener('click',function(){
      var idx=row.getAttribute('data-idx');
      var det=document.getElementById('detail-'+idx);
      var chev=document.getElementById('chev-'+idx);
      if(!det)return;
      var opening=!det.classList.contains('open');
      det.classList.toggle('open',opening);
      chev.classList.toggle('open',opening);
    });
  });
})();`.trim();

  // Extract sparkline history values per dimension (include current run at the end)
  function sparkVals(dim: 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties' | 'responseProperties'): number[] | undefined {
    if (historyEntries.length === 0) return undefined;
    const vals = historyEntries.map((e) => (e.summary[dim]?.percentage ?? 0));
    // Append current run if it differs from last history entry (current run hasn't been appended yet)
    if (vals[vals.length - 1] !== result.summary[dim].percentage) {
      vals.push(result.summary[dim].percentage);
    }
    return vals.length >= 2 ? vals : undefined;
  }

  const overallClass = overallPct >= 80 ? 'green' : overallPct >= 50 ? 'yellow' : 'red';

  return `<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${esc(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="accent-bar"></div>
<header>
  <div class="header-left">
    ${logoHtml}
    <div class="header-brand">
      <span class="brand-name">playswag</span>
      <span class="brand-subtitle">${esc(title)}</span>
    </div>
  </div>
  <button class="theme-btn" id="theme-btn">🌙 Dark</button>
</header>
<div class="meta-bar">
  <span class="meta-pill">📅 ${dateStr}, ${timeStr}</span>
  ${result.specFiles.map((f) => `<span class="meta-pill">📄 <code>${esc(f)}</code></span>`).join('')}
  <span class="meta-pill">🧪 ${result.totalTestCount} test${result.totalTestCount !== 1 ? 's' : ''}</span>
</div>
<main>
  <div class="score-bar">
    <span class="score-label">Overall</span>
    <div class="score-track"><div class="score-fill ${overallClass}" style="width:${Math.min(overallPct, 100).toFixed(1)}%"></div></div>
    <span class="score-pct ${overallClass}">${overallPct.toFixed(1)}%</span>
  </div>

  <div class="summary">
    ${summaryCard('Endpoints', result.summary.endpoints.covered, result.summary.endpoints.total, result.summary.endpoints.percentage, sparkVals('endpoints'))}
    ${summaryCard('Status Codes', result.summary.statusCodes.covered, result.summary.statusCodes.total, result.summary.statusCodes.percentage, sparkVals('statusCodes'))}
    ${summaryCard('Parameters', result.summary.parameters.covered, result.summary.parameters.total, result.summary.parameters.percentage, sparkVals('parameters'))}
    ${summaryCard('Body Properties', result.summary.bodyProperties.covered, result.summary.bodyProperties.total, result.summary.bodyProperties.percentage, sparkVals('bodyProperties'))}
    ${summaryCard('Response Properties', result.summary.responseProperties.covered, result.summary.responseProperties.total, result.summary.responseProperties.percentage, sparkVals('responseProperties'))}
  </div>

  <div class="section">
    <div class="section-head">
      <div class="section-head-left">
        <span class="section-title">Operations</span>
        <span class="count">${result.operations.length}</span>
        <div class="filter-bar">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="covered">Covered</button>
          <button class="filter-btn" data-filter="uncovered">Uncovered</button>
          ${tagFilterButtons(result.operations)}
        </div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Path / Operation</th>
            <th style="text-align:center">Status</th>
            <th style="text-align:center">Params</th>
            <th style="text-align:center">Coverage</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
  ${tagGroupedRows(result.operations)}
        </tbody>
      </table>
    </div>
  </div>

  ${unmatchedSection(result)}
</main>
<footer>
  ${logoDataUrl ? `<img src="${logoDataUrl}" alt="" class="footer-logo" width="24" height="24">` : ''}
  <span>Generated by <strong>playswag</strong> v${esc(result.playswagVersion)} &middot; Playwright v${esc(result.playwrightVersion)} &middot; ${dateStr} ${timeStr}</span>
</footer>
<script>${js}</script>
</body>
</html>`;
}

/**
 * Write the standalone HTML coverage report to disk.
 */
export async function writeHtmlReport(
  result: CoverageResult,
  outputDir: string,
  config: HtmlOutputConfig = {},
  historyEntries: HistoryEntry[] = []
): Promise<string> {
  const { fileName = 'playswag-coverage.html' } = config;
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  const logoDataUrl = await loadLogoDataUrl();
  await writeFile(outputPath, generateHtmlReport(result, config, logoDataUrl, historyEntries), 'utf8');
  return outputPath;
}
