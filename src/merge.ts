import { computeSummaryFromOperations, computeTagCoverage } from './coverage/summary.js';
import type {
  CoverageResult,
  OperationCoverage,
  StatusCodeCoverage,
  ParamCoverage,
  BodyPropertyCoverage,
  ResponsePropertyCoverage,
  AcknowledgedServiceHits,
  EndpointHit,
} from './types.js';

function opKey(op: { method: string; path: string }): string {
  return `${op.method.toUpperCase()}:${op.path}`;
}

function mergeStatusCodes(
  a: Record<string, StatusCodeCoverage>,
  b: Record<string, StatusCodeCoverage>
): Record<string, StatusCodeCoverage> {
  const merged: Record<string, StatusCodeCoverage> = {};
  const allCodes = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const code of allCodes) {
    const ac = a[code];
    const bc = b[code];
    if (ac && bc) {
      merged[code] = {
        covered: ac.covered || bc.covered,
        testRefs: [...new Set([...ac.testRefs, ...bc.testRefs])],
      };
    } else {
      merged[code] = structuredClone(ac ?? bc);
    }
  }
  return merged;
}

function mergeParams(a: ParamCoverage[], b: ParamCoverage[]): ParamCoverage[] {
  const map = new Map<string, ParamCoverage>();
  for (const p of a) map.set(`${p.in}:${p.name}`, { ...p });
  for (const p of b) {
    const key = `${p.in}:${p.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.covered = existing.covered || p.covered;
    } else {
      map.set(key, { ...p });
    }
  }
  return [...map.values()];
}

function mergeBodyProps(a: BodyPropertyCoverage[], b: BodyPropertyCoverage[]): BodyPropertyCoverage[] {
  const map = new Map<string, BodyPropertyCoverage>();
  for (const p of a) map.set(p.name, { ...p });
  for (const p of b) {
    const existing = map.get(p.name);
    if (existing) {
      existing.covered = existing.covered || p.covered;
    } else {
      map.set(p.name, { ...p });
    }
  }
  return [...map.values()];
}

function mergeResponseProps(a: ResponsePropertyCoverage[], b: ResponsePropertyCoverage[]): ResponsePropertyCoverage[] {
  const map = new Map<string, ResponsePropertyCoverage>();
  for (const p of a) map.set(`${p.statusCode}:${p.name}`, { ...p });
  for (const p of b) {
    const key = `${p.statusCode}:${p.name}`;
    const existing = map.get(key);
    if (existing) {
      existing.covered = existing.covered || p.covered;
    } else {
      map.set(key, { ...p });
    }
  }
  return [...map.values()];
}

function mergeOperations(a: OperationCoverage, b: OperationCoverage): OperationCoverage {
  return {
    path: a.path,
    method: a.method,
    operationId: a.operationId ?? b.operationId,
    tags: a.tags ?? b.tags,
    deprecated: a.deprecated ?? b.deprecated,
    covered: a.covered || b.covered,
    statusCodes: mergeStatusCodes(a.statusCodes, b.statusCodes),
    parameters: mergeParams(a.parameters, b.parameters),
    bodyProperties: mergeBodyProps(a.bodyProperties, b.bodyProperties),
    responseProperties: mergeResponseProps(a.responseProperties, b.responseProperties),
    testRefs: [...new Set([...a.testRefs, ...b.testRefs])],
  };
}

function deduplicateHits(hits: EndpointHit[]): EndpointHit[] {
  const seen = new Set<string>();
  const result: EndpointHit[] = [];
  for (const hit of hits) {
    const key = `${hit.method}:${hit.url}:${hit.statusCode}:${hit.testFile}:${hit.testTitle}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(hit);
    }
  }
  return result;
}

function mergeAcknowledgedHits(all: AcknowledgedServiceHits[][]): AcknowledgedServiceHits[] {
  const map = new Map<string, AcknowledgedServiceHits>();
  for (const list of all) {
    for (const entry of list) {
      const existing = map.get(entry.pattern);
      if (existing) {
        existing.count += entry.count;
      } else {
        map.set(entry.pattern, { ...entry });
      }
    }
  }
  return [...map.values()];
}

/**
 * Merge multiple `CoverageResult` objects into a single combined result.
 *
 * Operations are matched by `method + path`. Coverage flags (covered booleans,
 * testRefs) are unioned — if any input marks an item as covered, the merged
 * result marks it as covered. Summary statistics and tag coverage are recomputed
 * from the merged operations.
 *
 * Typical use case: combining JSON reports produced by separate CI matrix jobs
 * that each run a subset of Playwright projects against the same API spec.
 *
 * @param results - Two or more `CoverageResult` objects to merge.
 * @returns A single merged `CoverageResult`.
 * @throws {Error} If fewer than two results are provided.
 */
export function mergeCoverageResults(...results: CoverageResult[]): CoverageResult {
  if (results.length < 2) {
    throw new Error('[playswag] mergeCoverageResults requires at least 2 results');
  }

  // Merge all operations by method+path key
  const opsMap = new Map<string, OperationCoverage>();
  for (const result of results) {
    for (const op of [...result.operations, ...result.uncoveredOperations]) {
      const key = opKey(op);
      const existing = opsMap.get(key);
      opsMap.set(key, existing ? mergeOperations(existing, op) : structuredClone(op));
    }
  }

  const allOps = [...opsMap.values()];
  const uncoveredOps = allOps.filter((o) => !o.covered);

  return {
    specFiles: [...new Set(results.flatMap((r) => r.specFiles))],
    timestamp: new Date().toISOString(),
    playwrightVersion: results[0].playwrightVersion,
    playswagVersion: results[0].playswagVersion,
    totalTestCount: results.reduce((sum, r) => sum + r.totalTestCount, 0),
    summary: computeSummaryFromOperations(allOps),
    tagCoverage: computeTagCoverage(allOps),
    operations: allOps,
    uncoveredOperations: uncoveredOps,
    unmatchedHits: deduplicateHits(results.flatMap((r) => r.unmatchedHits)),
    acknowledgedHits: mergeAcknowledgedHits(results.map((r) => r.acknowledgedHits)),
  };
}
