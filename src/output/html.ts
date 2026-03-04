import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, HtmlOutputConfig, OperationCoverage } from '../types.js';

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pctClass(pct: number): string {
  if (pct >= 80) return 'green';
  if (pct >= 50) return 'yellow';
  return 'red';
}

function progressBar(pct: number): string {
  return `<div class="bar-wrap"><div class="bar ${pctClass(pct)}" style="width:${Math.min(pct, 100).toFixed(1)}%"></div></div>`;
}

function summaryCard(label: string, covered: number, total: number, pct: number): string {
  return `<div class="card">
      <div class="card-label">${esc(label)}</div>
      <div class="card-fraction">${covered}<span class="card-total">/${total}</span></div>
      <div class="card-pct ${pctClass(pct)}">${pct.toFixed(1)}%</div>
      ${progressBar(pct)}
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
    const paramRatio = paramTotal === 0 ? '—' : `${paramCovered}/${paramTotal}`;
    const testRefsHtml = op.testRefs.length > 0
      ? op.testRefs.map((r) => `<code class="testref">${esc(r)}</code>`).join('<br>')
      : '<em class="muted">none</em>';

    return `<tr class="op-row" data-covered="${op.covered}" data-tags="${esc(tags)}" data-idx="${i}">
        <td><span class="method m-${op.method.toLowerCase()}">${esc(op.method)}</span></td>
        <td class="td-path">${esc(op.path)}${op.operationId ? `<br><small class="opid">${esc(op.operationId)}</small>` : ''}</td>
        <td class="td-center">${scCovered}/${scTotal}</td>
        <td class="td-center">${paramRatio}</td>
        <td class="td-center">${op.covered ? '<span class="tick green">✓</span>' : '<span class="tick red">✗</span>'}</td>
      </tr>
      <tr class="op-detail" id="detail-${i}">
        <td colspan="5">
          <div class="detail-grid">
            <div><strong class="detail-label">Status Codes</strong>${statusCodeBadges(op)}</div>
            <div><strong class="detail-label">Parameters</strong>${paramBadges(op)}</div>
            <div><strong class="detail-label">Body Properties</strong>${bodyBadges(op)}</div>
            <div><strong class="detail-label">Tests (${op.testRefs.length})</strong>${testRefsHtml}</div>
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
    `<tr><td><span class="method m-${h.method.toLowerCase()}">${esc(h.method)}</span></td><td class="td-mono">${esc(h.url)}</td><td class="td-center">${h.statusCode}</td><td>${esc(h.testTitle)}</td></tr>`
  ).join('\n        ');
  return `<div class="section">
    <div class="section-head">
      <span class="section-title">⚠ Unmatched Hits <span class="count">${result.unmatchedHits.length}</span></span>
      <span class="muted" style="font-size:12px">Recorded calls that matched no spec operation</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Method</th><th>URL</th><th>Status</th><th>Test</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>`;
}

/**
 * Generate a standalone HTML coverage report string.
 * Pure function — no I/O, easy to snapshot-test.
 */
export function generateHtmlReport(result: CoverageResult, config: HtmlOutputConfig = {}): string {
  const title = config.title ?? 'API Coverage Report';
  const d = new Date(result.timestamp);
  const dateStr = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-GB', { hour12: false });

  const css = `
:root{--bg:#f8f9fa;--surface:#fff;--border:#dee2e6;--text:#212529;--muted:#6c757d;
--green:#28a745;--yellow:#fd7e14;--red:#dc3545;--blue:#0d6efd;--grey:#adb5bd;
--green-bg:#d4edda;--yellow-bg:#fff3cd;--red-bg:#f8d7da;--grey-bg:#e9ecef;}
[data-theme=dark]{--bg:#1a1d23;--surface:#252930;--border:#373d47;--text:#e9ecef;--muted:#9aa0a9;
--green-bg:#1a3a25;--yellow-bg:#3a2d0a;--red-bg:#3a1a1d;--grey-bg:#2d3139;}
*{box-sizing:border-box;margin:0;padding:0;}
body{font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:var(--bg);color:var(--text);font-size:14px;line-height:1.5;}
header{background:var(--surface);border-bottom:1px solid var(--border);padding:20px 32px;display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;}
.brand{color:var(--blue);font-weight:800;}
header h1{font-size:20px;font-weight:700;}
.meta{color:var(--muted);font-size:12px;margin-top:4px;}
.meta code{background:var(--border);border-radius:3px;padding:1px 5px;font-size:11px;font-family:ui-monospace,monospace;}
.theme-btn{background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:5px 12px;cursor:pointer;color:var(--text);font-size:13px;white-space:nowrap;}
main{max-width:1240px;margin:0 auto;padding:28px 32px;}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:18px 20px;}
.card-label{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin-bottom:6px;}
.card-fraction{font-size:24px;font-weight:800;}
.card-total{font-size:16px;font-weight:400;color:var(--muted);}
.card-pct{font-size:14px;font-weight:600;margin:3px 0 10px;}
.green{color:var(--green);}.yellow{color:var(--yellow);}.red{color:var(--red);}
.bar-wrap{background:var(--border);border-radius:4px;height:6px;overflow:hidden;}
.bar{height:6px;border-radius:4px;transition:width .4s;}
.bar.green{background:var(--green);}.bar.yellow{background:var(--yellow);}.bar.red{background:var(--red);}
.section{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin-bottom:20px;overflow:hidden;}
.section-head{padding:14px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:16px;flex-wrap:wrap;}
.section-title{font-size:15px;font-weight:600;}
.count{background:var(--border);border-radius:10px;padding:1px 8px;font-size:12px;font-weight:600;margin-left:4px;}
.filter-bar{display:flex;gap:8px;flex-wrap:wrap;}
.filter-btn{background:var(--bg);border:1px solid var(--border);border-radius:20px;padding:3px 12px;cursor:pointer;font-size:12px;color:var(--text);transition:all .15s;}
.filter-btn.active,.filter-btn:hover{background:var(--blue);border-color:var(--blue);color:#fff;}
.table-wrap{overflow-x:auto;}
table{width:100%;border-collapse:collapse;}
th{text-align:left;padding:9px 16px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);border-bottom:1px solid var(--border);white-space:nowrap;}
.op-row td{padding:10px 16px;border-bottom:1px solid var(--border);vertical-align:middle;cursor:pointer;}
.op-row:hover td{background:var(--bg);}
.op-row.hidden{display:none;}
.op-detail{display:none;}
.op-detail td{padding:14px 20px;background:var(--bg);border-bottom:1px solid var(--border);}
.detail-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;}
.detail-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-bottom:6px;font-weight:600;}
.method{display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;color:#fff;font-family:ui-monospace,monospace;letter-spacing:.03em;}
.m-get{background:#28a745;}.m-post{background:#0d6efd;}.m-put{background:#fd7e14;}
.m-patch{background:#6f42c1;}.m-delete{background:#dc3545;}.m-head,.m-options,.m-trace{background:#6c757d;}
.td-path{font-family:ui-monospace,monospace;word-break:break-word;}
.td-center{text-align:center;}
.td-mono{font-family:ui-monospace,monospace;word-break:break-all;}
.opid{color:var(--muted);font-size:11px;}
.badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:11px;margin:2px;font-family:ui-monospace,monospace;}
.badge.green{background:var(--green-bg);color:var(--green);}.badge.red{background:var(--red-bg);color:var(--red);}
.badge.yellow{background:var(--yellow-bg);color:var(--yellow);}.badge.grey{background:var(--grey-bg);color:var(--muted);}
.tick{font-size:15px;font-weight:700;}
.testref{font-size:11px;background:var(--border);padding:2px 6px;border-radius:3px;display:inline-block;margin:1px 0;font-family:ui-monospace,monospace;}
.muted{color:var(--muted);}
footer{text-align:center;padding:20px 32px;color:var(--muted);font-size:12px;border-top:1px solid var(--border);margin-top:4px;}
@media(max-width:800px){.summary{grid-template-columns:1fr 1fr;}main{padding:16px;}}
@media(max-width:480px){.summary{grid-template-columns:1fr;}}`.trim();

  const js = `
(function(){
  var toggle=document.getElementById('theme-btn');
  var html=document.documentElement;
  var dark=localStorage.getItem('playswag-theme')==='dark';
  function applyTheme(d){dark=d;html.setAttribute('data-theme',d?'dark':'light');toggle.textContent=d?'☀ Light':'🌙 Dark';localStorage.setItem('playswag-theme',d?'dark':'light');}
  applyTheme(dark);
  toggle.addEventListener('click',function(){applyTheme(!dark);});

  var btns=document.querySelectorAll('.filter-btn');
  var rows=document.querySelectorAll('.op-row');
  btns.forEach(function(btn){
    btn.addEventListener('click',function(){
      btns.forEach(function(b){b.classList.remove('active');});
      btn.classList.add('active');
      var f=btn.getAttribute('data-filter');
      rows.forEach(function(row){
        var show=false;
        if(f==='all')show=true;
        else if(f==='covered')show=row.getAttribute('data-covered')==='true';
        else if(f==='uncovered')show=row.getAttribute('data-covered')==='false';
        else if(f.startsWith('tag:')){var tag=f.slice(4);show=row.getAttribute('data-tags').split(',').indexOf(tag)!==-1;}
        row.classList.toggle('hidden',!show);
        var idx=row.getAttribute('data-idx');
        var d=document.getElementById('detail-'+idx);
        if(d&&!show)d.style.display='none';
      });
    });
  });

  rows.forEach(function(row){
    row.addEventListener('click',function(){
      var idx=row.getAttribute('data-idx');
      var d=document.getElementById('detail-'+idx);
      if(d)d.style.display=d.style.display===''?'none':'';
    });
  });
})();`.trim();

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
  <div>
    <h1><span class="brand">playswag</span> &mdash; ${esc(title)}</h1>
    <div class="meta">
      ${dateStr} &middot; ${timeStr}
      &nbsp;&middot;&nbsp;
      ${result.specFiles.map((f) => `<code>${esc(f)}</code>`).join(' ')}
      &nbsp;&middot;&nbsp;
      ${result.totalTestCount} test${result.totalTestCount !== 1 ? 's' : ''}
    </div>
  </div>
  <button class="theme-btn" id="theme-btn">🌙 Dark</button>
</header>
<main>
  <div class="summary">
    ${summaryCard('Endpoints', result.summary.endpoints.covered, result.summary.endpoints.total, result.summary.endpoints.percentage)}
    ${summaryCard('Status Codes', result.summary.statusCodes.covered, result.summary.statusCodes.total, result.summary.statusCodes.percentage)}
    ${summaryCard('Parameters', result.summary.parameters.covered, result.summary.parameters.total, result.summary.parameters.percentage)}
    ${summaryCard('Body Properties', result.summary.bodyProperties.covered, result.summary.bodyProperties.total, result.summary.bodyProperties.percentage)}
  </div>

  <div class="section">
    <div class="section-head">
      <span class="section-title">Operations <span class="count">${result.operations.length}</span></span>
      <div class="filter-bar">
        <button class="filter-btn active" data-filter="all">All</button>
        <button class="filter-btn" data-filter="covered">Covered</button>
        <button class="filter-btn" data-filter="uncovered">Uncovered</button>
        ${tagFilterButtons(result.operations)}
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Method</th><th>Path</th><th style="text-align:center">Status</th><th style="text-align:center">Params</th><th style="text-align:center">✓</th></tr>
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
  Generated by <strong>playswag</strong> v${esc(result.playswagVersion)}
  &nbsp;&middot;&nbsp; Playwright v${esc(result.playwrightVersion)}
  &nbsp;&middot;&nbsp; ${dateStr} ${timeStr}
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
  config: HtmlOutputConfig = {}
): Promise<string> {
  const { fileName = 'playswag-coverage.html' } = config;
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generateHtmlReport(result, config), 'utf8');
  return outputPath;
}
