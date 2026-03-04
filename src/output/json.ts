import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, JsonOutputConfig } from '../types.js';

/**
 * Write the coverage result as a JSON file.
 */
export async function writeJsonReport(
  result: CoverageResult,
  outputDir: string,
  config: JsonOutputConfig = {}
): Promise<string> {
  const { fileName = 'playswag-coverage.json', pretty = true } = config;

  const outputPath = join(outputDir, fileName);

  await mkdir(dirname(outputPath), { recursive: true });

  const content = pretty
    ? JSON.stringify(result, null, 2)
    : JSON.stringify(result);

  await writeFile(outputPath, content, 'utf8');

  return outputPath;
}
