/**
 * Fetches and parses JSON from a URL
 * @param url URL to fetch from
 * @returns Parsed JSON object
 */
export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch from ${url}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}
