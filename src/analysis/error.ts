/**
 * Error analysis utilities
 */

import { RequestInfo } from '../types/request';
import { ErrorAnalysis } from '../types/coverage';
import { groupBy } from '../utils/array';

/**
 * Analyzes error patterns from request data
 */
export class ErrorAnalyzer {
  /**
   * Analyze error patterns from request data
   */
  static analyzeErrors(requests: RequestInfo[]): ErrorAnalysis {
    const errors = requests.filter(r => r.status && r.status >= 400);
    
    const errorsByStatus = groupBy(errors, r => r.status?.toString() || 'unknown');
    const mostCommonErrors = Object.entries(errorsByStatus)
      .map(([status, count]) => ({
        status,
        count,
        percentage: Math.round((count / errors.length) * 100 * 100) / 100
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5); // Top 5 errors

    return {
      totalErrors: errors.length,
      errorRate: requests.length > 0 ? Math.round((errors.length / requests.length) * 100 * 100) / 100 : 0,
      errorsByStatus,
      mostCommonErrors
    };
  }
}
