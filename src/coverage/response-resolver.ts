import type { NormalizedResponse } from '../types.js';

/** Resolve one documented response, preserving its key for coverage accounting. */
export function resolveResponseKey(
  responses: Record<string, NormalizedResponse>,
  statusCode: string
): string | undefined {
  if (Object.hasOwn(responses, statusCode)) return statusCode;
  if (/^[1-5]\d{2}$/.test(statusCode)) {
    const range = `${statusCode[0]}XX`;
    if (Object.hasOwn(responses, range)) return range;
  }
  return Object.hasOwn(responses, 'default') ? 'default' : undefined;
}
