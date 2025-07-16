/**
 * Array and collection utility functions
 */

/**
 * Groups an array by a key function
 */
export function groupBy<T>(array: T[], keyFn: (item: T) => string): Record<string, number> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    groups[key] = (groups[key] || 0) + 1;
    return groups;
  }, {} as Record<string, number>);
}

/**
 * Calculate percentile for an array of numbers
 */
export function calculatePercentile(values: number[], percentile: number): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return Math.round(sorted[index] || 0);
}
