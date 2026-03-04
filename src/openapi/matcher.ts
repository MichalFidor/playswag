import type { NormalizedOperation } from '../types.js';

interface MatchResult {
  operation: NormalizedOperation;
  pathParams: Record<string, string>;
}

/**
 * Strip a URL down to just its path component, optionally removing a baseURL prefix.
 *
 * Examples:
 *   stripToPath('https://api.example.com/api/users/123?foo=bar', 'https://api.example.com')
 *   => '/api/users/123'
 *
 *   stripToPath('https://api.example.com/svc/v1/users/123', 'https://api.example.com', '/svc')
 *   => '/v1/users/123'
 */
export function stripToPath(url: string, baseURL?: string, serverBasePath?: string): string {
  let path: string;

  try {
    const parsed = new URL(url);
    path = decodeURIComponent(parsed.pathname);
  } catch {
    path = url.split('?')[0] ?? url;
    path = decodeURIComponent(path);
  }

  if (baseURL) {
    let basePath: string;
    try {
      basePath = new URL(baseURL).pathname;
    } catch {
      basePath = baseURL;
    }
    const normBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    if (normBase && path.startsWith(normBase)) {
      path = path.slice(normBase.length) || '/';
    }
  }

  if (serverBasePath) {
    const normServer = serverBasePath.endsWith('/') ? serverBasePath.slice(0, -1) : serverBasePath;
    if (normServer && path.startsWith(normServer)) {
      path = path.slice(normServer.length) || '/';
    }
  }

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  if (process.env['PLAYSWAG_DEBUG']) {
    console.log(`[playswag:debug] stripToPath: "${url}" -> "${path}" (baseURL=${baseURL ?? '-'}, serverBasePath=${serverBasePath ?? '-'})`);
  }

  return path || '/';
}

/**
 * Try to match a recorded path against an OpenAPI path template.
 *
 * Template segments wrapped in `{param}` match any single path segment.
 * Returns the extracted path parameters, or null if the template doesn't match.
 *
 * Scoring: each literal (non-param) segment match adds 1 to the score.
 * This ensures `/api/users/me` is preferred over `/api/users/{id}` when both
 * templates exist.
 */
export function matchTemplate(
  recordedPath: string,
  template: string
): { pathParams: Record<string, string>; score: number } | null {
  const recordedSegments = recordedPath.split('/').filter((s) => s.length > 0);
  const templateSegments = template.split('/').filter((s) => s.length > 0);

  if (recordedSegments.length !== templateSegments.length) return null;

  const pathParams: Record<string, string> = {};
  let score = 0;

  for (let i = 0; i < templateSegments.length; i++) {
    const tSeg = templateSegments[i]!;
    const rSeg = recordedSegments[i]!;

    if (tSeg.startsWith('{') && tSeg.endsWith('}')) {
      const paramName = tSeg.slice(1, -1);
      pathParams[paramName] = rSeg;
    } else {
      if (tSeg.toLowerCase() !== rSeg.toLowerCase()) return null;
      score += 1;
    }
  }

  return { pathParams, score };
}

/**
 * Find the best matching OpenAPI operation for a recorded URL + HTTP method.
 *
 * Returns the matched operation with extracted path params, or null if no
 * operation matches.
 */
export function matchOperation(
  recordedUrl: string,
  recordedMethod: string,
  operations: NormalizedOperation[],
  baseURL?: string
): MatchResult | null {
  const method = recordedMethod.toUpperCase();

  let bestMatch: MatchResult | null = null;
  let bestScore = -1;

  for (const op of operations) {
    if (op.method !== method) continue;

    // Strip using this operation's own serverBasePath so multi-service specs resolve correctly.
    const path = stripToPath(recordedUrl, baseURL, op.serverBasePath);
    const result = matchTemplate(path, op.pathTemplate);
    if (result && result.score > bestScore) {
      bestScore = result.score;
      bestMatch = { operation: op, pathParams: result.pathParams };
    }
  }

  return bestMatch;
}
