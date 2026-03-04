import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, JUnitOutputConfig, ThresholdConfig } from '../types.js';

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

interface DimensionCase {
  name: string;
  classname: string;
  actual: number;
  threshold: number | null;
  violated: boolean;
}

/**
 * Build one `<testcase>` element. When `violated` is true a `<failure>` child is added.
 */
function buildTestCase(tc: DimensionCase): string {
  const attrs = [
    `name="${xmlEscape(tc.name)}"`,
    `classname="${xmlEscape(tc.classname)}"`,
    `time="0"`,
  ].join(' ');

  if (tc.violated && tc.threshold !== null) {
    const msg = xmlEscape(
      `${tc.name}: ${tc.actual.toFixed(1)}% is below threshold ${tc.threshold}%`
    );
    const body = xmlEscape(
      `Expected: >= ${tc.threshold}%. Actual: ${tc.actual.toFixed(1)}%.`
    );
    return `    <testcase ${attrs}>\n      <failure message="${msg}" type="ThresholdViolation">${body}</failure>\n    </testcase>`;
  }

  return `    <testcase ${attrs} />`;
}

/**
 * Write a JUnit-compatible XML report that represents coverage threshold checks as test cases.
 * One `<testcase>` per coverage dimension; failures are marked when a threshold is violated.
 * If no threshold is configured for a dimension, the testcase always passes.
 *
 * Compatible with Jenkins, Azure Pipelines, and GitHub Actions test reporters.
 */
export async function writeJUnitReport(
  result: CoverageResult,
  outputDir: string,
  threshold: ThresholdConfig | undefined,
  config: JUnitOutputConfig = {}
): Promise<string> {
  const { fileName = 'playswag-junit.xml' } = config;
  const outputPath = join(outputDir, fileName);

  function resolveMin(key: keyof ThresholdConfig): number | null {
    const entry = threshold?.[key];
    if (entry === undefined) return null;
    return typeof entry === 'number' ? entry : entry.min;
  }

  const dimensions: Array<{ label: string; key: keyof ThresholdConfig; actual: number }> = [
    { label: 'Endpoint Coverage',          key: 'endpoints',          actual: result.summary.endpoints.percentage },
    { label: 'Status Code Coverage',       key: 'statusCodes',        actual: result.summary.statusCodes.percentage },
    { label: 'Parameter Coverage',         key: 'parameters',         actual: result.summary.parameters.percentage },
    { label: 'Body Property Coverage',     key: 'bodyProperties',     actual: result.summary.bodyProperties.percentage },
    { label: 'Response Property Coverage', key: 'responseProperties', actual: result.summary.responseProperties.percentage },
  ];

  let failures = 0;
  const cases: DimensionCase[] = dimensions.map(({ label, key, actual }) => {
    const min = resolveMin(key);
    const violated = min !== null && actual < min;
    if (violated) failures++;
    return { name: label, classname: 'playswag.coverage', actual, threshold: min, violated };
  });

  const now = new Date(result.timestamp);
  const timestamp = now.toISOString().replace('Z', '');

  const testCaseLines = cases.map(buildTestCase).join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="playswag API Coverage" tests="${cases.length}" failures="${failures}" time="0">`,
    `  <testsuite name="API Coverage Thresholds" tests="${cases.length}" failures="${failures}" timestamp="${timestamp}" hostname="playswag">`,
    testCaseLines,
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, xml, 'utf8');

  return outputPath;
}
