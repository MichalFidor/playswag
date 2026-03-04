import type {
  EndpointHit,
  NormalizedSpec,
  CoverageResult,
  OperationCoverage,
  CoverageSummaryItem,
  ParamCoverage,
  BodyPropertyCoverage,
  StatusCodeCoverage,
} from '../types.js';
import { matchOperation } from '../openapi/matcher.js';
import { analyzeParameters, analyzeBodyProperties } from './schema-analyzer.js';

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

    const bodyProperties: BodyPropertyCoverage[] = [];

    opMap.set(key, {
      path: op.pathTemplate,
      method: op.method,
      operationId: op.operationId,
      tags: op.tags,
      covered: false,
      statusCodes,
      parameters,
      bodyProperties,
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
    if (bodyCoverage.length > 0) {
      if (cov.bodyProperties.length === 0) {
        cov.bodyProperties.push(...bodyCoverage);
      } else {
        for (const bc of bodyCoverage) {
          const existing = cov.bodyProperties.find((b) => b.name === bc.name);
          if (existing && bc.covered) existing.covered = true;
        }
      }
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
    },
    operations: allOps,
    uncoveredOperations: uncoveredOps,
    unmatchedHits,
  };
}
