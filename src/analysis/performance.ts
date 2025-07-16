/**
 * Performance analysis utilities
 */

import { RequestInfo } from '../types/request';
import { PerformanceMetrics } from '../types/coverage';
import { calculatePercentile } from '../utils/array';

/**
 * Analyzes performance metrics from request data
 */
export class PerformanceAnalyzer {
  /**
   * Calculate performance metrics from request data
   */
  static analyzePerformance(requests: RequestInfo[]): PerformanceMetrics | null {
    const durations = requests.filter(r => r.duration).map(r => r.duration!);
    
    if (durations.length === 0) {
      return null;
    }

    return {
      averageResponseTime: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      minResponseTime: Math.min(...durations),
      maxResponseTime: Math.max(...durations),
      p95ResponseTime: calculatePercentile(durations, 95),
      p99ResponseTime: calculatePercentile(durations, 99)
    };
  }
}
