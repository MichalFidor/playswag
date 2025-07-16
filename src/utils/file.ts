import { readFileSync } from 'fs';

/**
 * Reads and parses a JSON file
 * @param filePath Path to the JSON file
 * @returns Parsed JSON object
 */
export function readJsonFile<T>(filePath: string): T {
  try {
    const content = readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    throw new Error(`Failed to read or parse JSON file ${filePath}: ${error}`);
  }
}
