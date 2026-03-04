import { describe, it, expect } from 'vitest';
import { checkThresholds } from '../../src/output/console.js';
import type { CoverageResult, ThresholdConfig } from '../../src/types.js';

function makeItem(percentage: number) {
  const covered = percentage;
  const total = 100;
  return { total, covered, percentage };
}

function makeResult(
  endpoints: number,
  statusCodes: number,
  parameters: number,
  bodyProperties: number
): CoverageResult {
  return {
    specFiles: [],
    timestamp: new Date().toISOString(),
    playwrightVersion: '1.0.0',
    playswagVersion: '0.1.0',
    totalTestCount: 0,
    summary: {
      endpoints: makeItem(endpoints),
      statusCodes: makeItem(statusCodes),
      parameters: makeItem(parameters),
      bodyProperties: makeItem(bodyProperties),
    },
    operations: [],
    uncoveredOperations: [],
    unmatchedHits: [],
  };
}

describe('checkThresholds', () => {
  it('returns no violations when all dimensions are above thresholds', () => {
    const result = makeResult(80, 75, 60, 50);
    const threshold: ThresholdConfig = {
      endpoints: 80,
      statusCodes: 75,
      parameters: 60,
      bodyProperties: 50,
    };
    expect(checkThresholds(result, threshold)).toEqual([]);
  });

  it('returns a violation when endpoints coverage is below threshold', () => {
    const result = makeResult(79.9, 100, 100, 100);
    const violations = checkThresholds(result, { endpoints: 80 });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/Endpoint coverage/);
    expect(violations[0].message).toMatch(/79\.9%/);
    expect(violations[0].message).toMatch(/80%/);
  });

  it('returns a violation when statusCodes coverage is below threshold', () => {
    const result = makeResult(100, 60, 100, 100);
    const violations = checkThresholds(result, { statusCodes: 80 });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/Status code coverage/);
    expect(violations[0].message).toMatch(/60\.0%/);
  });

  it('returns a violation when parameters coverage is below threshold', () => {
    const result = makeResult(100, 100, 50, 100);
    const violations = checkThresholds(result, { parameters: 70 });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/Parameter coverage/);
  });

  it('returns a violation when bodyProperties coverage is below threshold', () => {
    const result = makeResult(100, 100, 100, 40);
    const violations = checkThresholds(result, { bodyProperties: 50 });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/Body property coverage/);
  });

  it('returns multiple violations when several dimensions are below threshold', () => {
    const result = makeResult(50, 40, 30, 20);
    const threshold: ThresholdConfig = {
      endpoints: 80,
      statusCodes: 80,
      parameters: 80,
      bodyProperties: 80,
    };
    const violations = checkThresholds(result, threshold);
    expect(violations).toHaveLength(4);
  });

  it('does not flag a dimension when no threshold is set for it', () => {
    const result = makeResult(0, 0, 0, 0);
    // Only statusCodes threshold set; the zero-coverage dimensions should not
    // produce violations for the unconfigured keys.
    const violations = checkThresholds(result, { statusCodes: 50 });
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toMatch(/Status code/);
  });

  it('does not flag when actual equals the threshold exactly', () => {
    const result = makeResult(80, 80, 80, 80);
    const threshold: ThresholdConfig = { endpoints: 80, statusCodes: 80, parameters: 80, bodyProperties: 80 };
    expect(checkThresholds(result, threshold)).toEqual([]);
  });

  it('returns no violations when threshold object is empty', () => {
    const result = makeResult(0, 0, 0, 0);
    expect(checkThresholds(result, {})).toEqual([]);
  });

  it('ThresholdEntry shorthand { min } behaves the same as a plain number', () => {
    const result = makeResult(79.9, 100, 100, 100);
    const byNumber = checkThresholds(result, { endpoints: 80 });
    const byEntry = checkThresholds(result, { endpoints: { min: 80 } });
    expect(byEntry).toHaveLength(byNumber.length);
    expect(byEntry[0].message).toBe(byNumber[0].message);
  });

  it('per-entry fail:true overrides globalFail=false', () => {
    const result = makeResult(70, 100, 100, 100);
    const violations = checkThresholds(result, { endpoints: { min: 80, fail: true } }, false);
    expect(violations[0].fail).toBe(true);
  });

  it('per-entry fail:false overrides globalFail=true', () => {
    const result = makeResult(70, 100, 100, 100);
    const violations = checkThresholds(result, { endpoints: { min: 80, fail: false } }, true);
    expect(violations[0].fail).toBe(false);
  });

  it('violation.fail defaults to false when globalFail is not set', () => {
    const result = makeResult(70, 100, 100, 100);
    const violations = checkThresholds(result, { endpoints: 80 });
    expect(violations[0].fail).toBe(false);
  });

  it('violation.fail is true when globalFail=true and no per-entry override', () => {
    const result = makeResult(70, 100, 100, 100);
    const violations = checkThresholds(result, { endpoints: 80 }, true);
    expect(violations[0].fail).toBe(true);
  });
});
