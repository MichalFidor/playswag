import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, CoverageSummary, HistoryConfig } from '../types.js';

/**
 * A single historical entry persisted in the history file.
 */
export interface HistoryEntry {
  timestamp: string;
  specFiles: string[];
  summary: CoverageSummary;
}

/**
 * Per-dimension diff between two coverage runs. Positive = improved, negative = regressed.
 */
export interface CoverageDelta {
  endpoints: number;
  statusCodes: number;
  parameters: number;
  bodyProperties: number;
  responseProperties: number;
}

const DEFAULT_FILE_NAME = 'playswag-history.json';
const DEFAULT_MAX_ENTRIES = 50;

function historyPath(outputDir: string, config: HistoryConfig = {}): string {
  return join(outputDir, config.fileName ?? DEFAULT_FILE_NAME);
}

/**
 * Read the history file and return all entries, or an empty array when the file is missing.
 */
async function readHistory(filePath: string): Promise<HistoryEntry[]> {
  try {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as HistoryEntry[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn(`[playswag] Could not read history file "${filePath}": ${(err as Error).message}`);
    }
    return [];
  }
}

/**
 * Append the current run's summary to the history file, trimming old entries if needed.
 */
export async function appendToHistory(
  result: CoverageResult,
  outputDir: string,
  config: HistoryConfig = {}
): Promise<void> {
  const maxEntries = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const filePath = historyPath(outputDir, config);

  const existing = await readHistory(filePath);

  const entry: HistoryEntry = {
    timestamp: result.timestamp,
    specFiles: result.specFiles,
    summary: result.summary,
  };

  existing.push(entry);

  // Keep only the most recent maxEntries
  const trimmed = existing.length > maxEntries
    ? existing.slice(existing.length - maxEntries)
    : existing;

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, JSON.stringify(trimmed, null, 2), 'utf8');
}

/**
 * Load the most recent history entry, or `null` if no history exists yet.
 */
export async function loadLastEntry(
  outputDir: string,
  config: HistoryConfig = {}
): Promise<HistoryEntry | null> {
  const filePath = historyPath(outputDir, config);
  const entries = await readHistory(filePath);
  return entries.length > 0 ? entries[entries.length - 1]! : null;
}

/**
 * Load all history entries (for sparklines etc.), or `[]` if none exist.
 */
export async function loadAllEntries(
  outputDir: string,
  config: HistoryConfig = {}
): Promise<HistoryEntry[]> {
  return readHistory(historyPath(outputDir, config));
}

/**
 * Pure function: compute the per-dimension percentage delta between two runs.
 * Positive values mean the current run is higher (better).
 */
export function compareCoverage(
  current: CoverageSummary,
  previous: CoverageSummary
): CoverageDelta {
  return {
    endpoints:          Math.round((current.endpoints.percentage          - previous.endpoints.percentage)          * 10) / 10,
    statusCodes:        Math.round((current.statusCodes.percentage        - previous.statusCodes.percentage)        * 10) / 10,
    parameters:         Math.round((current.parameters.percentage         - previous.parameters.percentage)         * 10) / 10,
    bodyProperties:     Math.round((current.bodyProperties.percentage     - previous.bodyProperties.percentage)     * 10) / 10,
    responseProperties: Math.round(((current.responseProperties?.percentage ?? 0) - (previous.responseProperties?.percentage ?? 0)) * 10) / 10,
  };
}
