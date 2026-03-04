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
 * across three dimensions: operations, status codes, and request body properties / parameters.
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
    console.log('[playswag:debug]   serverBasePath   :', spec.serverBasePath);
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
    if (!cov.testRefs.includes(ref)) cov.testRefs.push(ref);

    const enrichedHit: EndpointHit = { ...hit, pathParams };

    const code = String(hit.statusCode);
    if (cov.statusCodes[code]) {
      cov.statusCodes[code]!.covered = true;
      if (!cov.statusCodes[code]!.testRefs.includes(ref)) {
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


  const totalEndpoints = allOps.length;
  const coveredEndpoints = allOps.filter((o) => o.covered).length;

  let totalStatusCodes = 0;
  let coveredStatusCodes = 0;
  for (const op of allOps) {
    for (const sc of Object.values(op.statusCodes)) {
      totalStatusCodes++;
      if (sc.covered) coveredStatusCodes++;
    }
  }

  let totalParams = 0;
  let coveredParams = 0;
  for (const op of allOps) {
    for (const p of op.parameters) {
      totalParams++;
      if (p.covered) coveredParams++;
    }
  }

  let totalBody = 0;
  let coveredBody = 0;
  for (const op of allOps) {
    for (const b of op.bodyProperties) {
      totalBody++;
      if (b.covered) coveredBody++;
    }
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
    },
    operations: allOps,
    uncoveredOperations: uncoveredOps,
    unmatchedHits,
  };
}
