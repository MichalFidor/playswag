/** Substrings matched case-insensitively against JSON object keys (not values). */
export const DEFAULT_REDACT_BODY_FIELDS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'api_key',
  'apikey',
  'access_token',
  'refresh_token',
  'client_secret',
  'private_key',
  'credential',
  'ssn',
  'credit_card',
  'card_number',
];

function keyMatchesField(key: string, patterns: string[]): boolean {
  const lower = key.toLowerCase();
  return patterns.some((p) => {
    const pl = p.toLowerCase();
    return lower === pl || lower.includes(pl);
  });
}

/**
 * Recursively redact sensitive fields in JSON-like request/response bodies.
 */
export function redactSensitiveFields(
  value: unknown,
  patterns: string[] = DEFAULT_REDACT_BODY_FIELDS
): unknown {
  const ancestors = new WeakSet<object>();
  let remaining = 10_000;
  let remainingBytes = 256 * 1024;
  function visit(input: unknown, depth: number, sensitive = false): unknown {
    if (--remaining < 0 || depth > 32) return '[Truncated]';
    if (input === null || input === undefined) return input;
    if (Buffer.isBuffer(input) || ArrayBuffer.isView(input)) return '[Binary]';
    if (typeof input !== 'object') {
      if (sensitive) return '[REDACTED]';
      if (typeof input === 'string') {
        remainingBytes -= Buffer.byteLength(input);
        if (remainingBytes < 0) return '[Truncated]';
      }
      return input;
    }
    if (ancestors.has(input)) return '[Circular]';
    ancestors.add(input);
    const out: Record<string, unknown> | unknown[] = Array.isArray(input) ? [] : Object.create(null);
    // Accessors and custom toJSON methods must never run while recording traffic.
    const keys = Array.isArray(input)
      ? Array.from({ length: Math.min(input.length, remaining) }, (_, index) => String(index))
      : Object.keys(input);
    for (const key of keys) {
      if (remaining <= 0) break;
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      const child = descriptor && 'value' in descriptor ? descriptor.value : '[Accessor]';
      Object.defineProperty(out, key, {
        value: visit(child, depth + 1, sensitive || keyMatchesField(key, patterns)),
        enumerable: true, configurable: true, writable: true,
      });
    }
    ancestors.delete(input);
    return out;
  }
  return visit(value, 0);
}

/** Decode serialized bodies before redaction; opaque payloads have no coverage shape. */
export function redactRequestBody(value: unknown, patterns = DEFAULT_REDACT_BODY_FIELDS): unknown {
  if (typeof value === 'string' || Buffer.isBuffer(value)) {
    const size = typeof value === 'string' ? Buffer.byteLength(value) : value.length;
    if (size > 256 * 1024) return '[Truncated]';
    const text = typeof value === 'string' ? value : value.toString('utf8');
    try {
      const parsed: unknown = JSON.parse(text);
      return parsed !== null && typeof parsed === 'object' ? redactSensitiveFields(parsed, patterns) : '[REDACTED]';
    } catch {
      // Form bodies retain their field names, but never their opaque values.
      if (text.includes('=')) {
        return Object.fromEntries([...new URLSearchParams(text).keys()].map((key) => [key, '[REDACTED]']));
      }
      return '[REDACTED]';
    }
  }
  if (value instanceof URLSearchParams || (typeof FormData !== 'undefined' && value instanceof FormData)) {
    return Object.fromEntries([...value.keys()].map((key) => [key, '[REDACTED]']));
  }
  if (value !== null && value !== undefined && typeof value !== 'object') return '[REDACTED]';
  return redactSensitiveFields(value, patterns);
}

/** Preserve URL matching and query names while removing credentials and query values. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.hash = '';
    for (const key of new Set(url.searchParams.keys())) url.searchParams.set(key, '[REDACTED]');
    return url.toString();
  } catch {
    // Invalid URLs must not provide a fallback path for leaking credentials.
    return '[Invalid URL]';
  }
}
