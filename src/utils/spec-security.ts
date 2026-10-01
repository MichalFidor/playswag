import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';
import type { LookupAddress } from 'node:dns';

export interface SpecSecurityOptions {
  allowedSpecHosts?: string[];
  allowPrivateHosts?: boolean;
}

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.+$/, '');
}

function isPrivateIpv4(host: string): boolean {
  const [a, b, c] = host.split('.').map(Number);
  return a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
    (a === 203 && b === 0 && c === 113) || a >= 224;
}

function isPrivateIpv6(host: string): boolean {
  // WHATWG URL canonicalizes dotted IPv4 tails and expanded IPv6 notation.
  const canonical = normalizeHost(new URL(`http://[${host}]/`).hostname);
  const [head, tail] = canonical.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right];
  const words = groups.map((group) => Number.parseInt(group, 16));
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff) {
    return isPrivateIpv4(`${words[6] >> 8}.${words[6] & 255}.${words[7] >> 8}.${words[7] & 255}`);
  }
  // Only globally routed unicast addresses are eligible. This excludes unspecified,
  // loopback, link/site-local, unique-local, multicast and IPv4 translation ranges.
  return (words[0] & 0xe000) !== 0x2000 || words[0] === 0x2002 ||
    (words[0] === 0x2001 && (words[1] === 0 || words[1] === 0xdb8));
}

const BLOCKED_METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata.goog']);

function isBlockedHostname(host: string): boolean {
  const lower = normalizeHost(host);
  if (BLOCKED_METADATA_HOSTS.has(lower) || lower.endsWith('.metadata.google.internal')) return true;
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (isIP(lower) === 4) return isPrivateIpv4(lower);
  if (isIP(lower) === 6) return isPrivateIpv6(lower);
  return false;
}

function hostAllowed(host: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts?.length) return true;
  const lower = normalizeHost(host);
  return allowedHosts.some((pattern) => {
    const p = normalizeHost(pattern);
    if (p.startsWith('*.')) return lower === p.slice(2) || lower.endsWith(p.slice(1));
    return lower === p;
  });
}

export function isRemoteSpecSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/** Remote root specs must declare an allowlist for their entire $ref chain. */
export function assertRemoteSpecHostsRequired(
  sources: string | string[],
  options: SpecSecurityOptions = {}
): void {
  const list = Array.isArray(sources) ? sources : [sources];
  if (list.some(isRemoteSpecSource) && !options.allowedSpecHosts?.length) {
    throw new Error(
      '[playswag] Remote spec URL(s) require allowedSpecHosts (SSRF protection). ' +
        'Example: allowedSpecHosts: ["api.example.com", "*.githubusercontent.com"]'
    );
  }
}

async function resolveAddresses(host: string, signal?: AbortSignal): Promise<LookupAddress[]> {
  signal?.throwIfAborted();
  const pending = lookup(host, { all: true });
  if (!signal) return pending;
  // dns.lookup itself cannot be cancelled, but a timed-out lookup must never start a request.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    void pending.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

/** Validate and resolve once; callers must connect using only the returned addresses. */
export async function resolveSpecUrl(
  url: string,
  options: SpecSecurityOptions = {},
  signal?: AbortSignal
): Promise<{ url: URL; addresses: LookupAddress[] }> {
  signal?.throwIfAborted();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid spec URL: ${url}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Unsupported spec URL protocol "${parsed.protocol}" — use http(s):// or a local file path`);
  }
  if (!options.allowedSpecHosts?.length) {
    throw new Error(
      '[playswag] HTTP spec fetches require allowedSpecHosts (SSRF protection). ' +
        'Set allowedSpecHosts when specs is a remote URL or when your spec uses HTTP $ref pointers. ' +
        'Example: allowedSpecHosts: ["api.example.com", "*.githubusercontent.com"]'
    );
  }
  const host = normalizeHost(parsed.hostname);
  if (!options.allowPrivateHosts && isBlockedHostname(host)) {
    throw new Error(`Spec URL host "${host}" is blocked (private/loopback). Use a local file path or set allowPrivateHosts: true`);
  }
  if (!hostAllowed(host, options.allowedSpecHosts)) {
    throw new Error(`Spec URL host "${host}" is not in allowedSpecHosts: ${options.allowedSpecHosts.join(', ')}`);
  }
  const family = isIP(host);
  const addresses = family ? [{ address: host, family }] : await resolveAddresses(host, signal);
  signal?.throwIfAborted();
  if (addresses.length === 0) throw new Error(`Spec URL host "${host}" did not resolve to an IP address`);
  for (const record of addresses) {
    if (!isIP(record.address) || isIP(record.address) !== record.family) {
      throw new Error(`Spec URL host "${host}" resolved to an invalid IP address`);
    }
    if (!options.allowPrivateHosts && isBlockedHostname(record.address)) {
      throw new Error(`Spec URL host "${host}" resolves to private or reserved address ${record.address}`);
    }
  }
  return { url: parsed, addresses };
}

/** Validate a remote spec URL. Fetches additionally pin the validated addresses. */
export async function assertSpecUrlAllowed(url: string, options: SpecSecurityOptions = {}): Promise<void> {
  await resolveSpecUrl(url, options);
}
