import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CoverageResult, HtmlOutputConfig, OperationCoverage } from '../types.js';
import type { HistoryEntry } from './history.js';

async function loadLogoDataUrl(): Promise<string> {
  try {
    const assetPath = fileURLToPath(new URL('../../assets/logo.png', import.meta.url));
    const buf = await readFile(assetPath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
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

function operationRows(ops: OperationCoverage[]): string {
  return ops.map((op, i) => {
    const tags = (op.tags ?? []).join(',');
    const scCovered = Object.values(op.statusCodes).filter((s) => s.covered).length;
    const scTotal = Object.keys(op.statusCodes).length;
    const paramTotal = op.parameters.length + op.bodyProperties.length;
    const paramCovered = op.parameters.filter((p) => p.covered).length + op.bodyProperties.filter((b) => b.covered).length;
    const paramRatio = paramTotal === 0 ? '<span class="muted">—</span>' : `${paramCovered}/${paramTotal}`;
    const testRefsHtml = op.testRefs.length > 0
      ? op.testRefs.map((r) => `<span class="testref">${esc(r)}</span>`).join('')
      : '<em class="muted">none</em>';

    const tagBadges = (op.tags ?? []).length > 0
      ? (op.tags ?? []).map((t) => `<span class="tag-badge">${esc(t)}</span>`).join('')
      : '';

    return `<tr class="op-row" data-covered="${op.covered}" data-tags="${esc(tags)}" data-idx="${i}">
        <td class="td-method"><span class="method m-${op.method.toLowerCase()}">${esc(op.method)}</span></td>
        <td class="td-path">
          <span class="path-text">${esc(op.path)}</span>
          ${op.operationId ? `<span class="opid">${esc(op.operationId)}</span>` : ''}
          ${tagBadges ? `<span class="tag-wrap">${tagBadges}</span>` : ''}
        </td>
        <td class="td-center">${scCovered}/${scTotal}</td>
        <td class="td-center">${paramRatio}</td>
        <td class="td-center">${op.covered ? '<span class="tick green">✓</span>' : '<span class="tick red">✗</span>'}</td>
        <td class="td-chevron"><span class="chevron" id="chev-${i}">›</span></td>
      </tr>
      <tr class="op-detail" id="detail-${i}">
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
            <div class="detail-section detail-tests">
              <div class="detail-label">Tests <span class="detail-count">${op.testRefs.length}</span></div>
              <div class="detail-content">${testRefsHtml}</div>
            </div>
          </div>
        </td>
      </tr>`;
  }).join('\n  ');
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
    ? `<img src="${logoDataUrl}" alt="playswag logo" class="logo" width="36" height="36">`
    : '';

  // Overall score: average of all four percentages
  const overallPct = (
    result.summary.endpoints.percentage +
    result.summary.statusCodes.percentage +
    result.summary.parameters.percentage +
    result.summary.bodyProperties.percentage
  ) / 4;

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

/* ── Header ── */
header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; box-shadow: var(--shadow); position: sticky; top: 0; z-index: 100; }
.header-left { display: flex; align-items: center; gap: 12px; }
.logo { border-radius: 6px; flex-shrink: 0; }
.header-brand { display: flex; flex-direction: column; gap: 1px; }
.brand-name { font-size: 17px; font-weight: 800; color: var(--blue); letter-spacing: -.3px; line-height: 1.2; }
.brand-title { font-size: 13px; color: var(--text2); font-weight: 500; }
.header-right { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.meta-pills { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.meta-pill { display: inline-flex; align-items: center; gap: 4px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 3px 10px; font-size: 11px; color: var(--muted); white-space: nowrap; }
.meta-pill code { background: none; font-family: ui-monospace, monospace; color: var(--text2); font-size: 11px; }
.theme-btn { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 6px 12px; cursor: pointer; color: var(--text2); font-size: 12px; font-weight: 500; transition: all .15s; white-space: nowrap; }
.theme-btn:hover { border-color: var(--blue); color: var(--blue); }

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
.summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
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

/* ── Misc ── */
.muted { color: var(--muted); }
.green { color: var(--green); }
.yellow { color: var(--yellow); }
.red { color: var(--red); }

/* ── Footer ── */
footer { text-align: center; padding: 24px 32px; color: var(--muted); font-size: 12px; border-top: 1px solid var(--border); margin-top: 8px; display: flex; align-items: center; justify-content: center; gap: 12px; }
.footer-logo { opacity: .5; border-radius: 4px; }

/* ── Responsive ── */
@media(max-width: 900px) { .summary { grid-template-columns: 1fr 1fr; } main { padding: 16px; } header { padding: 14px 16px; } }
@media(max-width: 480px) { .summary { grid-template-columns: 1fr; } .meta-pills { display: none; } .detail-inner { grid-template-columns: 1fr; } }`.trim();

  const js = `
(function(){
  var btn=document.getElementById('theme-btn');
  var html=document.documentElement;
  var dark=localStorage.getItem('playswag-theme')==='dark';
  function applyTheme(d){dark=d;html.setAttribute('data-theme',d?'dark':'light');btn.textContent=d?'☀ Light':'🌙 Dark';localStorage.setItem('playswag-theme',d?'dark':'light');}
  applyTheme(dark);
  btn.addEventListener('click',function(){applyTheme(!dark);});

  var filterBtns=document.querySelectorAll('.filter-btn');
  var rows=document.querySelectorAll('.op-row');
  filterBtns.forEach(function(b){
    b.addEventListener('click',function(){
      filterBtns.forEach(function(x){x.classList.remove('active');});
      b.classList.add('active');
      var f=b.getAttribute('data-filter');
      rows.forEach(function(row){
        var show=f==='all'||
          (f==='covered'&&row.getAttribute('data-covered')==='true')||
          (f==='uncovered'&&row.getAttribute('data-covered')==='false')||
          (f.startsWith('tag:')&&row.getAttribute('data-tags').split(',').indexOf(f.slice(4))!==-1);
        row.classList.toggle('hidden',!show);
        var idx=row.getAttribute('data-idx');
        var det=document.getElementById('detail-'+idx);
        if(det&&!show){det.classList.remove('open');document.getElementById('chev-'+idx).classList.remove('open');}
      });
    });
  });

  rows.forEach(function(row){
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
  function sparkVals(dim: 'endpoints' | 'statusCodes' | 'parameters' | 'bodyProperties'): number[] | undefined {
    if (historyEntries.length === 0) return undefined;
    const vals = historyEntries.map((e) => e.summary[dim].percentage);
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
<header>
  <div class="header-left">
    ${logoHtml}
    <div class="header-brand">
      <span class="brand-name">playswag</span>
      <span class="brand-title">${esc(title)}</span>
    </div>
  </div>
  <div class="header-right">
    <div class="meta-pills">
      <span class="meta-pill">📅 ${dateStr}, ${timeStr}</span>
      ${result.specFiles.map((f) => `<span class="meta-pill">📄 <code>${esc(f)}</code></span>`).join('')}
      <span class="meta-pill">🧪 ${result.totalTestCount} test${result.totalTestCount !== 1 ? 's' : ''}</span>
    </div>
    <button class="theme-btn" id="theme-btn">🌙 Dark</button>
  </div>
</header>
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
            <th style="text-align:center">Hit</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
  ${operationRows(result.operations)}
        </tbody>
      </table>
    </div>
  </div>

  ${unmatchedSection(result)}
</main>
<footer>
  ${logoDataUrl ? `<img src="${logoDataUrl}" alt="" class="footer-logo" width="20" height="20">` : ''}
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
