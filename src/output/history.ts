import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { CoverageResult, CoverageSummary, HistoryConfig } from '../types.js';
import { log } from '../log.js';
import { isCoverageSummary, readJsonFileWithLimit } from '../utils/safe-json.js';

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
const MAX_HISTORY_ENTRIES = 10_000;

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.timestamp === 'string' && Number.isFinite(Date.parse(entry.timestamp))
    && Array.isArray(entry.specFiles) && entry.specFiles.every((path) => typeof path === 'string')
    && isCoverageSummary(entry.summary);
}

function entryLimit(config: HistoryConfig): number {
  const limit = config.maxEntries ?? DEFAULT_MAX_ENTRIES;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_HISTORY_ENTRIES) {
    throw new Error(`[playswag] history.maxEntries must be an integer between 1 and ${MAX_HISTORY_ENTRIES}`);
  }
  return limit;
}

function historyPath(outputDir: string, config: HistoryConfig = {}): string {
  return join(outputDir, config.fileName ?? DEFAULT_FILE_NAME);
}

/**
 * Read the history file and return all entries, or an empty array when the file is missing.
 */
async function readHistory(filePath: string, maxEntries: number): Promise<HistoryEntry[]> {
  try {
    const value = await readJsonFileWithLimit<unknown>(filePath);
    if (!Array.isArray(value) || value.length > MAX_HISTORY_ENTRIES) throw new Error('Invalid history entries');
    const entries = value.map((entry: unknown) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
      const old = entry as Record<string, unknown>;
      const summary = old.summary;
      if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return old;
      return { ...old, summary: { ...summary, responseProperties: (summary as Record<string, unknown>).responseProperties === undefined
        ? { total: 0, covered: 0, percentage: 100 } : (summary as Record<string, unknown>).responseProperties } };
    });
    if (!entries.every(isHistoryEntry)) throw new Error('Invalid history entry shape');
    return entries.slice(-maxEntries);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      log.warn(`Could not read history file "${filePath}": ${(err as Error).message}`);
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
  const maxEntries = entryLimit(config);
  const filePath = historyPath(outputDir, config);

  const existing = await readHistory(filePath, maxEntries);

  const entry: HistoryEntry = {
    timestamp: result.timestamp,
    specFiles: result.specFiles,
    summary: result.summary,
  };
  if (!isHistoryEntry(entry)) throw new Error('[playswag] Invalid coverage history entry');

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
  const entries = await readHistory(filePath, entryLimit(config));
  return entries.length > 0 ? entries[entries.length - 1]! : null;
}

/**
 * Load all history entries (for sparklines etc.), or `[]` if none exist.
 */
export async function loadAllEntries(
  outputDir: string,
  config: HistoryConfig = {}
): Promise<HistoryEntry[]> {
  return readHistory(historyPath(outputDir, config), entryLimit(config));
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
