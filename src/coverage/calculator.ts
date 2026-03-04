import type {
  EndpointHit,
  NormalizedSpec,
  CoverageResult,
  OperationCoverage,
  CoverageSummary,
  CoverageSummaryItem,
  ParamCoverage,
  StatusCodeCoverage,
} from '../types.js';
import { matchOperation } from '../openapi/matcher.js';
import { analyzeParameters, analyzeBodyProperties, analyzeResponseProperties } from './schema-analyzer.js';

function makeItem(total: number, covered: number): CoverageSummaryItem {
  return {
    total,
    covered,
    percentage: total === 0 ? 100 : Math.round((covered / total) * 1000) / 10,
  };
}

function testRef(hit: EndpointHit): string {
  return `${hit.testFile} > ${hit.testTitle}`;
}

/**
 * Given all aggregated endpoint hits and a normalized spec, calculate coverage
 * across four dimensions: operations, status codes, parameters, and request body properties.
 */
export function calculateCoverage(
  hits: EndpointHit[],
  spec: NormalizedSpec,
  options: {
    baseURL?: string;
    playwrightVersion?: string;
    playswagVersion?: string;
    totalTestCount?: number;
  } = {}
): CoverageResult {
  if (process.env['PLAYSWAG_DEBUG']) {
    console.log('[playswag:debug] calculateCoverage called');
    console.log('[playswag:debug]   hits.length      :', hits.length);
    console.log('[playswag:debug]   options.baseURL  :', options.baseURL);
    console.log('[playswag:debug]   spec.operations  :', spec.operations.length);
    if (hits.length > 0) {
      console.log('[playswag:debug]   first hit        :', hits[0]?.method, hits[0]?.url);
    }
  }

  const opMap = new Map<string, OperationCoverage>();

  for (const op of spec.operations) {
    const key = `${op.method}:${op.pathTemplate}`;

    const statusCodes: Record<string, StatusCodeCoverage> = {};
    for (const code of Object.keys(op.responses)) {
      statusCodes[code] = { covered: false, testRefs: [] };
    }

    const parameters: ParamCoverage[] = op.parameters.map((p) => ({
      name: p.name,
      in: p.in,
      required: p.required,
      covered: false,
    }));

    // Pre-seed from spec so uncovered operations still show what could be covered
    const bodyProperties = analyzeBodyProperties(op, null);

    // Pre-seed response properties for all response codes that have schemas
    const responseProperties = Object.keys(op.responses).flatMap((code) =>
      analyzeResponseProperties(op, code, undefined)
    );

    opMap.set(key, {
      path: op.pathTemplate,
      method: op.method,
      operationId: op.operationId,
      tags: op.tags,
      covered: false,
      statusCodes,
      parameters,
      bodyProperties,
      responseProperties,
      testRefs: [],
    });
  }

  const unmatchedHits: EndpointHit[] = [];

  for (const hit of hits) {
    const match = matchOperation(hit.url, hit.method, spec.operations, options.baseURL);

    if (!match) {
      unmatchedHits.push(hit);
      if (process.env['PLAYSWAG_DEBUG'] && unmatchedHits.length <= 3) {
        console.log(`[playswag:debug]   unmatched hit    : ${hit.method} ${hit.url}`);
      }
      continue;
    }

    const { operation: matchedOp, pathParams } = match;
    const key = `${matchedOp.method}:${matchedOp.pathTemplate}`;
    const cov = opMap.get(key);
    if (!cov) continue;

    cov.covered = true;
    const ref = testRef(hit);
    const testRefSet = new Set(cov.testRefs);
    if (!testRefSet.has(ref)) cov.testRefs.push(ref);

    const enrichedHit: EndpointHit = { ...hit, pathParams };

    const code = String(hit.statusCode);
    if (cov.statusCodes[code]) {
      cov.statusCodes[code]!.covered = true;
      const statusRefSet = new Set(cov.statusCodes[code]!.testRefs);
      if (!statusRefSet.has(ref)) {
        cov.statusCodes[code]!.testRefs.push(ref);
      }
    }

    const paramCoverage = analyzeParameters(
      matchedOp,
      enrichedHit.queryParams,
      enrichedHit.pathParams,
      enrichedHit.headers
    );
    for (const pc of paramCoverage) {
      const existing = cov.parameters.find((p) => p.name === pc.name && p.in === pc.in);
      if (existing && pc.covered) existing.covered = true;
    }

    const bodyCoverage = analyzeBodyProperties(matchedOp, enrichedHit.requestBody);
    for (const bc of bodyCoverage) {
      const existing = cov.bodyProperties.find((b) => b.name === bc.name);
      if (existing && bc.covered) existing.covered = true;
    }

    const respCoverage = analyzeResponseProperties(matchedOp, code, enrichedHit.responseBody);
    for (const rc of respCoverage) {
      const existing = cov.responseProperties.find(
        (r) => r.name === rc.name && r.statusCode === rc.statusCode
      );
      if (existing && rc.covered) existing.covered = true;
    }
  }

  const allOps = Array.from(opMap.values());
  const uncoveredOps = allOps.filter((o) => !o.covered);

  function countCoveredItems<T extends { covered: boolean }>(
    selector: (op: OperationCoverage) => T[]
  ): [total: number, covered: number] {
    let total = 0, covered = 0;
    for (const op of allOps) {
      for (const item of selector(op)) {
        total++;
        if (item.covered) covered++;
      }
    }
    return [total, covered];
  }

  const totalEndpoints = allOps.length;
  const coveredEndpoints = allOps.filter((o) => o.covered).length;

  const [totalStatusCodes, coveredStatusCodes] = countCoveredItems((op) =>
    Object.values(op.statusCodes)
  );
  const [totalParams, coveredParams] = countCoveredItems((op) => op.parameters);
  const [totalBody, coveredBody] = countCoveredItems((op) => op.bodyProperties);
  const [totalResponseProps, coveredResponseProps] = countCoveredItems((op) => op.responseProperties);

  // Aggregate per-tag coverage
  const tagOpsMap = new Map<string, OperationCoverage[]>();
  for (const op of allOps) {
    const tags = op.tags?.length ? op.tags : ['(untagged)'];
    for (const tag of tags) {
      if (!tagOpsMap.has(tag)) tagOpsMap.set(tag, []);
      tagOpsMap.get(tag)!.push(op);
    }
  }

  const tagCoverage: Record<string, CoverageSummary> = {};
  for (const [tag, ops] of tagOpsMap) {
    const tagEndpoints = ops.length;
    const tagCoveredEndpoints = ops.filter((o) => o.covered).length;

    let tSC = 0, cSC = 0, tP = 0, cP = 0, tB = 0, cB = 0, tR = 0, cR = 0;
    for (const op of ops) {
      for (const sc of Object.values(op.statusCodes)) { tSC++; if (sc.covered) cSC++; }
      for (const p of op.parameters) { tP++; if (p.covered) cP++; }
      for (const b of op.bodyProperties) { tB++; if (b.covered) cB++; }
      for (const r of op.responseProperties) { tR++; if (r.covered) cR++; }
    }

    tagCoverage[tag] = {
      endpoints: makeItem(tagEndpoints, tagCoveredEndpoints),
      statusCodes: makeItem(tSC, cSC),
      parameters: makeItem(tP, cP),
      bodyProperties: makeItem(tB, cB),
      responseProperties: makeItem(tR, cR),
    };
  }

  return {
    specFiles: spec.sources,
    timestamp: new Date().toISOString(),
    playwrightVersion: options.playwrightVersion ?? 'unknown',
    playswagVersion: options.playswagVersion ?? 'unknown',
    totalTestCount: options.totalTestCount ?? 0,
    summary: {
      endpoints: makeItem(totalEndpoints, coveredEndpoints),
      statusCodes: makeItem(totalStatusCodes, coveredStatusCodes),
      parameters: makeItem(totalParams, coveredParams),
      bodyProperties: makeItem(totalBody, coveredBody),
      responseProperties: makeItem(totalResponseProps, coveredResponseProps),
    },
    tagCoverage,
    operations: allOps,
    uncoveredOperations: uncoveredOps,
    unmatchedHits,
  };
}
