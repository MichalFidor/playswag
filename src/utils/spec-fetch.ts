import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';
import type { Transform } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { resolveSpecUrl, type SpecSecurityOptions } from './spec-security.js';

export const DEFAULT_SPEC_FETCH_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_SPEC_BYTES = 5 * 1024 * 1024;

export interface SpecFetchOptions extends SpecSecurityOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Internal parse-wide cancellation and decoded byte accounting. */
  signal?: AbortSignal;
  onDecodedBytes?: (bytes: number) => void;
}

type FetchHop = { redirect: string } | { body: Buffer };

async function fetchHop(
  current: string,
  options: SpecFetchOptions,
  maxBytes: number,
  signal: AbortSignal
): Promise<FetchHop> {
  const resolved = await resolveSpecUrl(current, options, signal);
  signal.throwIfAborted();
  // Keep the original URL hostname for Host, certificate validation and TLS SNI.
  // Node's socket lookup receives only the previously validated addresses, never a second DNS lookup.
  const pinnedLookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    const family = Number(lookupOptions.family);
    const addresses = family ? resolved.addresses.filter((record) => record.family === family) : resolved.addresses;
    // Socket connection attempts must start after Node attaches its error listeners.
    process.nextTick(() => {
      if (addresses.length === 0) {
        callback(new Error('No validated spec address for the requested IP family'), '');
      } else if (lookupOptions.all) {
        callback(null, addresses);
      } else {
        callback(null, addresses[0].address, addresses[0].family);
      }
    });
  };
  return new Promise((resolve, reject) => {
    const request = resolved.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(resolved.url, {
      method: 'GET',
      agent: false,
      lookup: pinnedLookup,
      signal,
      headers: {
        Accept: 'application/json, application/yaml, text/yaml, */*',
        'Accept-Encoding': 'gzip, deflate, br',
      },
    });
    let responseStream: IncomingMessage | undefined;
    let decoder: Transform | undefined;
    let settled = false;
    const finish = (result?: FetchHop, error?: Error) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve(result!);
      if (error || (result && 'redirect' in result)) {
        decoder?.destroy();
        responseStream?.destroy();
        req.destroy();
      }
    };
    const abort = () => finish(undefined, signal.reason as Error);
    signal.addEventListener('abort', abort, { once: true });
    req.on('error', (error) => finish(undefined, error));
    req.on('response', (response: IncomingMessage) => {
      responseStream = response;
      const fail = (error: Error) => finish(undefined, error);
      response.on('error', fail);
      response.on('aborted', () => fail(new Error(`Incomplete spec response from "${current}"`)));
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        const location = response.headers.location;
        if (!location) fail(new Error(`HTTP ${status} redirect from "${current}" has no Location header`));
        else {
          try { finish({ redirect: new URL(location, current).href }); }
          catch (error) { fail(error as Error); }
        }
        return;
      }
      if (status < 200 || status >= 300) {
        fail(new Error(`HTTP ${status} while fetching spec URL "${current}"`));
        return;
      }
      const tooLarge = () => new Error(`Spec response from "${current}" exceeds maxSpecBytes (${maxBytes} bytes)`);
      const contentLength = response.headers['content-length'];
      if (contentLength && Number(contentLength) > maxBytes) {
        fail(tooLarge());
        return;
      }
      const encoding = response.headers['content-encoding']?.toLowerCase();
      decoder = encoding === 'gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() :
        encoding === 'br' ? createBrotliDecompress() : undefined;
      if (encoding && encoding !== 'identity' && !decoder) {
        fail(new Error(`Unsupported spec response encoding "${encoding}"`));
        return;
      }
      const stream = decoder ?? response;
      let wireBytes = 0;
      let bytes = 0;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        wireBytes += chunk.length;
        if (wireBytes > maxBytes) fail(tooLarge());
      });
      stream.on('data', (chunk: Buffer) => {
        if (settled) return;
        bytes += chunk.length;
        if (bytes > maxBytes) fail(tooLarge());
        else {
          try {
            options.onDecodedBytes?.(chunk.length);
            if (!settled) chunks.push(chunk);
          } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
      stream.on('error', fail);
      stream.on('end', () => { if (!settled) finish({ body: Buffer.concat(chunks, bytes) }); });
      if (decoder) response.pipe(decoder);
    });
    req.end();
  });
}

/** Fetch with one deadline for DNS, redirects and body, and streaming byte limits. */
export async function fetchSpecContent(url: string, options: SpecFetchOptions = {}): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_SPEC_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_SPEC_BYTES;
  const maxRedirects = options.maxRedirects ?? 5;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) {
    throw new Error('specFetchTimeoutMs must be a positive finite timeout no greater than 2147483647');
  }
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('maxSpecBytes must be a positive integer');
  if (!Number.isSafeInteger(maxRedirects) || maxRedirects < 0) throw new Error('maxRedirects must be a non-negative integer');

  const controller = new AbortController();
  const abortFromParse = () => controller.abort(options.signal?.reason);
  options.signal?.throwIfAborted();
  options.signal?.addEventListener('abort', abortFromParse, { once: true });
  const timeoutError = new Error(`Spec fetch timed out after ${timeoutMs} ms`);
  const timeoutId = setTimeout(() => controller.abort(timeoutError), timeoutMs);
  let current = url;
  const visited = new Set<string>();
  try {
    visited.add(new URL(url).href);
    for (let hop = 0; hop <= maxRedirects; hop++) {
      const result = await fetchHop(current, options, maxBytes, controller.signal);
      if ('body' in result) return result.body;
      if (hop >= maxRedirects) throw new Error(`Too many redirects while fetching spec (max ${maxRedirects})`);
      current = result.redirect;
      if (visited.has(current)) throw new Error(`Redirect loop detected while fetching spec: ${current}`);
      visited.add(current);
    }
    throw new Error(`Too many redirects while fetching spec (max ${maxRedirects})`);
  } catch (err) {
    if (controller.signal.aborted) throw controller.signal.reason;
    throw err;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromParse);
  }
}
