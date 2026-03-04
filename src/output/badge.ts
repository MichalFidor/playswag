import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, BadgeConfig } from '../types.js';

function badgeColor(pct: number): string {
  if (pct >= 80) return '#4c1';
  if (pct >= 50) return '#fe7d37';
  return '#e05d44';
}

function esc(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Generate a shields.io-style SVG badge string.
 * Pure function — no I/O, easy to test.
 */
export function generateBadgeSvg(result: CoverageResult, config: BadgeConfig = {}): string {
  const { dimension = 'endpoints', label = 'API Coverage' } = config;

  const item = result.summary[dimension];
  const pct = item.percentage;
  const valueText = `${pct.toFixed(1)}%`;
  const color = badgeColor(pct);

  // Approximate character widths for Verdana 11px (~6.5 px/char + 10px padding each side)
  const labelW = Math.round(label.length * 6.5 + 20);
  const valueW = Math.round(valueText.length * 6.5 + 20);
  const totalW = labelW + valueW;

  // SVG text coordinates are in 10× scale then shrunk via transform="scale(.1)"
  const labelX = Math.round((labelW / 2 + 1) * 10);
  const valueX = Math.round((labelW + valueW / 2) * 10);
  const labelTL = Math.round((labelW - 10) * 10);
  const valueTL = Math.round((valueW - 10) * 10);

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="20" role="img" aria-label="${esc(label)}: ${esc(valueText)}">
  <title>${esc(label)}: ${esc(valueText)}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0"  stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1"  stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${totalW}" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelW}" height="20" fill="#555"/>
    <rect x="${labelW}" width="${valueW}" height="20" fill="${color}"/>
    <rect width="${totalW}" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="110">
    <text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${labelTL}" lengthAdjust="spacing">${esc(label)}</text>
    <text x="${labelX}" y="140" transform="scale(.1)" textLength="${labelTL}" lengthAdjust="spacing">${esc(label)}</text>
    <text aria-hidden="true" x="${valueX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${valueTL}" lengthAdjust="spacing">${esc(valueText)}</text>
    <text x="${valueX}" y="140" transform="scale(.1)" textLength="${valueTL}" lengthAdjust="spacing">${esc(valueText)}</text>
  </g>
</svg>`;
}

/**
 * Write the SVG badge to disk.
 */
export async function writeBadge(
  result: CoverageResult,
  outputDir: string,
  config: BadgeConfig = {}
): Promise<string> {
  const { fileName = 'playswag-badge.svg' } = config;
  const outputPath = join(outputDir, fileName);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generateBadgeSvg(result, config), 'utf8');
  return outputPath;
}
