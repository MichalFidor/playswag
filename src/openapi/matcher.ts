import type { NormalizedOperation } from '../types.js';

interface MatchResult {
  operation: NormalizedOperation;
  pathParams: Record<string, string>;
}

// ── Operation index ───────────────────────────────────────────────────────────

/**
 * Pre-built lookup structure for efficient operation matching.
 * Construct once per spec via {@link buildOperationIndex}, then pass to every
 * {@link matchOperation} call to avoid redundant URL parsing.
 */
export interface OperationIndex {
  /**
   * Operations grouped by `"METHOD:firstLiteralSegment"`.
   * Operations whose first path template segment is a parameter (`{id}`) or whose
   * template is just `/` are stored under `"METHOD:"` (the catch-all bucket).
   */
  buckets: Map<string, NormalizedOperation[]>;
  /**
   * Deduplicated list of `serverBasePath` values found across all operations.
   * Usually contains only 1–2 values even in multi-service specs.
   */
  basePaths: (string | undefined)[];
}

/**
 * Build a {@link OperationIndex} from a list of normalized operations.
 * Call this once after parsing the spec; reuse the result for every hit.
 */
export function buildOperationIndex(operations: NormalizedOperation[]): OperationIndex {
  const buckets = new Map<string, NormalizedOperation[]>();
  const basePathSet = new Set<string | undefined>();

  for (const op of operations) {
    basePathSet.add(op.serverBasePath);

    const segments = op.pathTemplate.split('/').filter(Boolean);
    const first = segments[0];
    // Use the literal first segment as a narrow bucket key; fall back to '' for
    // parameterised first segments (e.g. "/{id}") or root paths ("/").
    const key = `${op.method}:${(first && !first.startsWith('{')) ? first.toLowerCase() : ''}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(op);
    if (!buckets.has(key)) buckets.set(key, bucket);
  }

  return { buckets, basePaths: [...basePathSet] };
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
    // Not a full URL — treat the input as a raw path (e.g. "/api/users?q=1")
    path = url.split('?')[0] ?? url;
    path = decodeURIComponent(path);
  }

  if (baseURL) {
    let basePath: string;
    try {
      basePath = new URL(baseURL).pathname;
    } catch {
      // baseURL is already a path-like string
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
 *
 * Pass a pre-built {@link OperationIndex} (from {@link buildOperationIndex}) to
 * skip the O(n) linear scan and avoid redundant URL parsing — this is the
 * recommended path for the reporter which processes thousands of hits per run.
 */
export function matchOperation(
  recordedUrl: string,
  recordedMethod: string,
  operations: NormalizedOperation[],
  baseURL?: string,
  index?: OperationIndex
): MatchResult | null {
  const method = recordedMethod.toUpperCase();

  if (!index) {
    // Fallback: O(n) linear scan (no index — used by tests and one-off callers)
    let bestMatch: MatchResult | null = null;
    let bestScore = -1;
    for (const op of operations) {
      if (op.method !== method) continue;
      const path = stripToPath(recordedUrl, baseURL, op.serverBasePath);
      const result = matchTemplate(path, op.pathTemplate);
      if (result && result.score > bestScore) {
        bestScore = result.score;
        bestMatch = { operation: op, pathParams: result.pathParams };
      }
    }
    return bestMatch;
  }

  // ── Indexed path ──────────────────────────────────────────────────────────
  // 1. For each unique serverBasePath, compute the stripped path once.
  const strippedByBase = new Map<string | undefined, string>();
  for (const bp of index.basePaths) {
    strippedByBase.set(bp, stripToPath(recordedUrl, baseURL, bp));
  }

  // 2. Collect candidate operations from matching buckets.
  const candidates = new Set<NormalizedOperation>();
  const catchAllKey = `${method}:`;

  for (const stripped of strippedByBase.values()) {
    const firstSeg = stripped.split('/').filter(Boolean)[0]?.toLowerCase() ?? '';
    const literalKey = `${method}:${firstSeg}`;
    for (const op of index.buckets.get(literalKey) ?? []) candidates.add(op);
    for (const op of index.buckets.get(catchAllKey) ?? []) candidates.add(op);
  }

  // 3. Match only the candidates.
  let bestMatch: MatchResult | null = null;
  let bestScore = -1;

  for (const op of candidates) {
    const stripped = strippedByBase.get(op.serverBasePath)!;
    const result = matchTemplate(stripped, op.pathTemplate);
    if (result && result.score > bestScore) {
      bestScore = result.score;
      bestMatch = { operation: op, pathParams: result.pathParams };
    }
  }

  return bestMatch;
}
