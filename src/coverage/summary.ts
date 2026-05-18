import type {
  CoverageSummary,
  CoverageSummaryItem,
  OperationCoverage,
} from '../types.js';

/** Unified percentage rounding (1 decimal place) for reporter and merge. */
export function makeSummaryItem(total: number, covered: number): CoverageSummaryItem {
  return {
    total,
    covered,
    percentage: total === 0 ? 100 : Math.round((covered / total) * 1000) / 10,
  };
}

export function computeSummaryFromOperations(operations: OperationCoverage[]): CoverageSummary {
  const coveredEndpoints = operations.filter((o) => o.covered).length;

  let totalSC = 0, covSC = 0, totalP = 0, covP = 0, totalB = 0, covB = 0, totalR = 0, covR = 0;
  for (const op of operations) {
    for (const sc of Object.values(op.statusCodes)) {
      totalSC++;
      if (sc.covered) covSC++;
    }
    for (const p of op.parameters) {
      totalP++;
      if (p.covered) covP++;
    }
    for (const b of op.bodyProperties) {
      totalB++;
      if (b.covered) covB++;
    }
    for (const r of op.responseProperties) {
      totalR++;
      if (r.covered) covR++;
    }
  }

  return {
    endpoints: makeSummaryItem(operations.length, coveredEndpoints),
    statusCodes: makeSummaryItem(totalSC, covSC),
    parameters: makeSummaryItem(totalP, covP),
    bodyProperties: makeSummaryItem(totalB, covB),
    responseProperties: makeSummaryItem(totalR, covR),
  };
}

export function computeTagCoverage(
  operations: OperationCoverage[]
): Record<string, CoverageSummary> {
  const tagOpsMap = new Map<string, OperationCoverage[]>();
  for (const op of operations) {
    const tags = op.tags?.length ? op.tags : ['(untagged)'];
    for (const tag of tags) {
      const list = tagOpsMap.get(tag) ?? [];
      list.push(op);
      tagOpsMap.set(tag, list);
    }
  }

  const result: Record<string, CoverageSummary> = {};
  for (const [tag, ops] of tagOpsMap) {
    result[tag] = computeSummaryFromOperations(ops);
  }
  return result;
}
