import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

export interface SpecSecurityOptions {
  allowedSpecHosts?: string[];
  allowPrivateHosts?: boolean;
}

const PRIVATE_IPV4_RANGES = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
];

function isPrivateIpv4(host: string): boolean {
  return PRIVATE_IPV4_RANGES.some((re) => re.test(host));
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === '::1' ||
    h.startsWith('fc') ||
    h.startsWith('fd') ||
    h.startsWith('fe80')
  );
}

const BLOCKED_METADATA_HOSTS = new Set([
  'metadata.google.internal',
  'metadata.goog',
]);

function isBlockedHostname(host: string): boolean {
  const lower = host.toLowerCase();
  if (BLOCKED_METADATA_HOSTS.has(lower) || lower.endsWith('.metadata.google.internal')) {
    return true;
  }
  if (lower === 'localhost' || lower.endsWith('.localhost')) return true;
  if (isIP(host) === 4) return isPrivateIpv4(host);
  if (isIP(host) === 6) return isPrivateIpv6(host);
  return false;
}

function hostAllowed(host: string, allowedHosts?: string[]): boolean {
  if (!allowedHosts?.length) return true;
  const lower = host.toLowerCase();
  return allowedHosts.some((pattern) => {
    const p = pattern.toLowerCase();
    if (p.startsWith('*.')) return lower === p.slice(2) || lower.endsWith(p.slice(1));
    return lower === p;
  });
}

/**
 * Validate a remote spec URL before fetch/dereference (SSRF mitigation).
 * Blocks private/link-local hosts unless explicitly allowed.
 */
export function isRemoteSpecSource(source: string): boolean {
  return /^https?:\/\//i.test(source);
}

/**
 * Remote root specs must declare an allowlist so $ref chains cannot reach arbitrary hosts.
 */
export function assertRemoteSpecHostsRequired(
  sources: string | string[],
  options: SpecSecurityOptions = {}
): void {
  const list = Array.isArray(sources) ? sources : [sources];
  const hasRemote = list.some(isRemoteSpecSource);
  if (hasRemote && !options.allowedSpecHosts?.length) {
    throw new Error(
      '[playswag] Remote spec URL(s) require allowedSpecHosts (SSRF protection). ' +
        'Example: allowedSpecHosts: ["api.example.com", "*.githubusercontent.com"]'
    );
  }
}

export async function assertSpecUrlAllowed(
  url: string,
  options: SpecSecurityOptions = {}
): Promise<void> {
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

  const host = parsed.hostname;

  if (!options.allowPrivateHosts && isBlockedHostname(host)) {
    throw new Error(
      `Spec URL host "${host}" is blocked (private/loopback). Use a local file path or set allowPrivateHosts: true`
    );
  }

  if (!hostAllowed(host, options.allowedSpecHosts)) {
    throw new Error(
      `Spec URL host "${host}" is not in allowedSpecHosts: ${options.allowedSpecHosts?.join(', ')}`
    );
  }

  if (!options.allowPrivateHosts && isIP(host) === 0) {
    try {
      const records = await lookup(host, { all: true });
      for (const rec of records) {
        if (rec.family === 4 && isPrivateIpv4(rec.address)) {
          throw new Error(`Spec URL host "${host}" resolves to private address ${rec.address}`);
        }
        if (rec.family === 6 && isPrivateIpv6(rec.address)) {
          throw new Error(`Spec URL host "${host}" resolves to private address ${rec.address}`);
        }
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOTFOUND') {
        return;
      }
      throw err;
    }
  }
}
