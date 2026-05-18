import { assertSpecUrlAllowed, type SpecSecurityOptions } from './spec-security.js';

export const DEFAULT_SPEC_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_SPEC_BYTES = 5 * 1024 * 1024;

export interface SpecFetchOptions extends SpecSecurityOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

/**
 * Fetch a remote spec or $ref document with SSRF checks on every hop (including redirects).
 */
export async function fetchSpecContent(
  url: string,
  options: SpecFetchOptions = {}
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SPEC_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SPEC_BYTES;
  const maxRedirects = options.maxRedirects ?? 5;

  let current = url;
  const visited: string[] = [];

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSpecUrlAllowed(current, options);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { Accept: 'application/json, application/yaml, text/yaml, */*' },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch spec URL "${current}": ${message}`, { cause: err });
    } finally {
      clearTimeout(timeoutId);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`HTTP ${response.status} redirect from "${current}" has no Location header`);
      }
      if (hop >= maxRedirects) {
        throw new Error(`Too many redirects while fetching spec (max ${maxRedirects})`);
      }
      current = new URL(location, current).href;
      if (visited.includes(current)) {
        throw new Error(`Redirect loop detected while fetching spec: ${current}`);
      }
      visited.push(current);
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} while fetching spec URL "${current}"`);
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      throw new Error(
        `Spec response from "${current}" exceeds maxSpecBytes (${maxBytes} bytes, Content-Length: ${contentLength})`
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(
        `Spec response from "${current}" exceeds maxSpecBytes (${maxBytes} bytes, got ${arrayBuffer.byteLength})`
      );
    }

    return Buffer.from(arrayBuffer);
  }

  throw new Error(`Too many redirects while fetching spec (max ${maxRedirects})`);
}
