/**
 * URL manipulation utilities
 */

/**
 * Extracts the path from a URL
 */
export function extractPath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    return url;
  }
}
