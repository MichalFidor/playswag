import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateBadgeSvg, writeBadge } from '../../src/output/badge.js';
import type { CoverageResult } from '../../src/types.js';

function makeResult(endpointsPct = 80, overrides: Partial<CoverageResult> = {}): CoverageResult {
  const pct = endpointsPct;
  const total = 100;
  return {
    specFiles: ['openapi.yaml'],
    timestamp: '2025-01-01T00:00:00.000Z',
    playwrightVersion: '1.40.0',
    playswagVersion: '1.1.0',
    totalTestCount: 5,
    summary: {
      endpoints: { total, covered: pct, percentage: pct },
      statusCodes: { total, covered: 60, percentage: 60 },
      parameters: { total, covered: 45, percentage: 45 },
      bodyProperties: { total, covered: 90, percentage: 90 },
      responseProperties: { total, covered: 75, percentage: 75 },
    },
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
    ...overrides,
  };
}

describe('generateBadgeSvg', () => {
  it('returns a string containing <svg', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('<svg');
  });

  it('returns a valid SVG document', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('</svg>');
    expect(svg).toMatch(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  });

  it('uses green colour (#4c1) when percentage >= 80', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('#4c1');
  });

  it('uses orange colour when percentage is between 50 and 79', () => {
    const svg = generateBadgeSvg(makeResult(65));
    expect(svg).toContain('#fe7d37');
  });

  it('uses red colour when percentage is below 50', () => {
    const svg = generateBadgeSvg(makeResult(30));
    expect(svg).toContain('#e05d44');
  });

  it('uses boundary value: 50% is orange, not red', () => {
    const svg = generateBadgeSvg(makeResult(50));
    expect(svg).toContain('#fe7d37');
    expect(svg).not.toContain('#e05d44');
  });

  it('uses boundary value: 80% is green, not orange', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('#4c1');
    expect(svg).not.toContain('#fe7d37');
  });

  it('includes the percentage value in the SVG', () => {
    const svg = generateBadgeSvg(makeResult(75));
    expect(svg).toContain('75');
  });

  it('defaults to "API Coverage" label and endpoints dimension', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('API Coverage');
  });

  it('respects a custom label', () => {
    const svg = generateBadgeSvg(makeResult(80), { label: 'api cov' });
    expect(svg).toContain('api cov');
  });

  it('respects statusCodes dimension', () => {
    // statusCodes = 60%
    const svg = generateBadgeSvg(makeResult(80), { dimension: 'statusCodes' });
    expect(svg).toContain('60');
  });

  it('respects parameters dimension', () => {
    // parameters = 45% — below 50, so red
    const svg = generateBadgeSvg(makeResult(80), { dimension: 'parameters' });
    expect(svg).toContain('45');
    expect(svg).toContain('#e05d44'); // red (< 50%)
  });

  it('respects bodyProperties dimension', () => {
    // bodyProperties = 90%
    const svg = generateBadgeSvg(makeResult(80), { dimension: 'bodyProperties' });
    expect(svg).toContain('90');
    expect(svg).toContain('#4c1'); // green
  });

  it('respects responseProperties dimension', () => {
    // responseProperties = 75%
    const svg = generateBadgeSvg(makeResult(80), { dimension: 'responseProperties' });
    expect(svg).toContain('75');
    expect(svg).toContain('#fe7d37'); // orange (>= 50% but < 80%)
  });

  it('HTML-escapes special characters in label', () => {
    const svg = generateBadgeSvg(makeResult(80), { label: '<cover & test>' });
    expect(svg).not.toContain('<cover');
    expect(svg).toContain('&lt;cover');
    expect(svg).toContain('&amp;');
  });

  it('includes aria-label for accessibility', () => {
    const svg = generateBadgeSvg(makeResult(80));
    expect(svg).toContain('aria-label');
  });
});

describe('writeBadge', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'playswag-badge-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('writes the badge SVG to the default filename', async () => {
    await writeBadge(makeResult(80), tmpDir, {});
    const content = await readFile(join(tmpDir, 'playswag-badge.svg'), 'utf8');
    expect(content).toContain('<svg');
  });

  it('returns the full path of the written file', async () => {
    const path = await writeBadge(makeResult(80), tmpDir, {});
    expect(path).toBe(join(tmpDir, 'playswag-badge.svg'));
  });

  it('respects a custom fileName', async () => {
    await writeBadge(makeResult(80), tmpDir, { fileName: 'cov.svg' });
    const content = await readFile(join(tmpDir, 'cov.svg'), 'utf8');
    expect(content).toContain('<svg');
  });

  it('creates the output directory if it does not exist', async () => {
    const nested = join(tmpDir, 'nested', 'deep');
    await writeBadge(makeResult(80), nested, {});
    const content = await readFile(join(nested, 'playswag-badge.svg'), 'utf8');
    expect(content).toContain('<svg');
  });
});
