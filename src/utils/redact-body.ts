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
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveFields(item, patterns));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = keyMatchesField(key, patterns)
        ? '[REDACTED]'
        : redactSensitiveFields(val, patterns);
    }
    return out;
  }
  return value;
}
