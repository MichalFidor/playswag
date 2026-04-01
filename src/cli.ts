#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { mergeCoverageResults } from './merge.js';
import type { CoverageResult } from './types.js';

const HELP = `Usage: playswag merge <file1.json> <file2.json> [...] [options]

Merge multiple playswag JSON coverage reports into a single combined report.

Options:
  -o, --output <path>     Output file path (default: merged-coverage.json)
  --no-pretty             Disable JSON pretty-printing
  --console               Print coverage summary table to the terminal
  --html                  Write a self-contained HTML report next to the output file
  --badge                 Write an SVG coverage badge next to the output file
  --markdown              Write a Markdown coverage report next to the output file
  -h, --help              Show this help message

When running inside GitHub Actions (GITHUB_ACTIONS=true), a step summary
is automatically written to $GITHUB_STEP_SUMMARY.

Example:
  playswag merge shard-1.json shard-2.json -o combined.json
  playswag merge reports/*.json --console --html -o combined.json
  npx @michalfidor/playswag merge reports/*.json`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    output: { type: 'string', short: 'o', default: 'merged-coverage.json' },
    pretty: { type: 'boolean', default: true },
    console: { type: 'boolean', default: false },
    html: { type: 'boolean', default: false },
    badge: { type: 'boolean', default: false },
    markdown: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help || positionals.length === 0) {
   
  console.log(HELP);
  process.exit(0);
}

const command = positionals[0];

if (command !== 'merge') {
  console.error(`[playswag] Unknown command: ${command}\nRun "playswag --help" for usage.`);
  process.exit(1);
}

const files = positionals.slice(1);

if (files.length < 2) {
  console.error('[playswag] merge requires at least 2 JSON report files');
  process.exit(1);
}

const results: CoverageResult[] = [];

for (const file of files) {
  try {
    const raw = await readFile(file, 'utf8');
    results.push(JSON.parse(raw) as CoverageResult);
  } catch (err) {
    console.error(`[playswag] Failed to read ${file}: ${(err as Error).message}`);
    process.exit(1);
  }
}

const merged = mergeCoverageResults(...results);
const output = values.output!;
const outputDir = dirname(resolve(output));

await mkdir(outputDir, { recursive: true });
const content = values.pretty ? JSON.stringify(merged, null, 2) : JSON.stringify(merged);
await writeFile(output, content, 'utf8');

 
console.log(`[playswag] Merged ${files.length} reports → ${output}`);

if (values.console) {
  const { printConsoleReport } = await import('./output/console.js');
  await printConsoleReport(merged);
}

if (values.html) {
  const { writeHtmlReport } = await import('./output/html.js');
  const path = await writeHtmlReport(merged, outputDir);
   
  console.log(`[playswag] HTML report → ${path}`);
}

if (values.badge) {
  const { writeBadge } = await import('./output/badge.js');
  const path = await writeBadge(merged, outputDir);
   
  console.log(`[playswag] Badge → ${path}`);
}

if (values.markdown) {
  const { writeMarkdownReport } = await import('./output/markdown.js');
  const path = await writeMarkdownReport(merged, outputDir);
   
  console.log(`[playswag] Markdown report → ${path}`);
}

// GitHub Actions: auto-write step summary
const { isGitHubActions } = await import('./output/github-actions.js');
if (isGitHubActions()) {
  const { writeStepSummary } = await import('./output/github-actions.js');
  await writeStepSummary(merged, []);
   
  console.log('[playswag] GitHub Actions step summary written');
}

