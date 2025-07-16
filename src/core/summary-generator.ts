/**
 * Summary generation utilities - extracted from main PlaySwag class
 */

import { RequestInfo } from '../types/request';
import { 
  ComprehensiveSummary, 
  EndpointUsage, 
  EndpointUsageInternal 
} from '../types/coverage';
import { CoverageAnalyzer } from '../reporting/coverage-analyzer';
import { RequestTracker } from '../core/request-tracker';
import { PerformanceAnalyzer, ErrorAnalyzer, RecommendationEngine } from '../analysis';

/**
 * Handles comprehensive summary generation
 */
export class SummaryGenerator {
  /**
   * Generate comprehensive summary from request data
   */
  static generateComprehensiveSummary(
    tracker: RequestTracker,
    analyzer: CoverageAnalyzer,
    useGlobalData: boolean = false
  ): ComprehensiveSummary {
    const report = analyzer.analyze(useGlobalData);
    const requests = useGlobalData ? tracker.getGlobalRequests() : tracker.getRequests();
    const timestamp = new Date();

    // Calculate additional metrics
    const endpointUsage = this.calculateEndpointUsage(requests);
    const performanceMetrics = PerformanceAnalyzer.analyzePerformance(requests);
    const errorAnalysis = ErrorAnalyzer.analyzeErrors(requests);

    return {
      metadata: {
        generatedAt: timestamp.toISOString(),
        generatedBy: 'PlaySwag',
        version: '1.0.0',
        sessionDuration: requests.length > 0 ? 
          Math.round((Math.max(...requests.map(r => r.timestamp)) - Math.min(...requests.map(r => r.timestamp))) / 1000) : 0
      },
      coverage: report,
      requestSummary: {
        totalRequests: requests.length,
        uniqueEndpoints: tracker.getUniqueEndpoints().size,
        timeRange: requests.length > 0 ? {
          start: new Date(Math.min(...requests.map(r => r.timestamp))).toISOString(),
          end: new Date(Math.max(...requests.map(r => r.timestamp))).toISOString()
        } : null,
        methodDistribution: report.requestSummary.methodDistribution,
        statusDistribution: report.requestSummary.statusDistribution
      },
      endpointUsage,
      performanceMetrics,
      errorAnalysis,
      recommendations: RecommendationEngine.generateRecommendations(report, errorAnalysis)
    };
  }

  /**
   * Calculate endpoint usage statistics
   */
  private static calculateEndpointUsage(requests: RequestInfo[]): EndpointUsage[] {
    const endpointUsage = new Map<string, EndpointUsageInternal>();
    
    requests.forEach((req: any) => {
      const key = `${req.method.toUpperCase()} ${req.url}`;
      const existing = endpointUsage.get(key);
      if (existing) {
        existing.callCount++;
        existing.totalDuration += req.duration || 0;
        existing.averageDuration = existing.totalDuration / existing.callCount;
        if (req.status) existing.statusCodes.add(req.status);
        existing.lastCalled = Math.max(existing.lastCalled, req.timestamp);
      } else {
        endpointUsage.set(key, {
          endpoint: key,
          callCount: 1,
          totalDuration: req.duration || 0,
          averageDuration: req.duration || 0,
          statusCodes: new Set(req.status ? [req.status] : []),
          firstCalled: req.timestamp,
          lastCalled: req.timestamp
        });
      }
    });

    // Convert usage map to array
    return Array.from(endpointUsage.values()).map(usage => ({
      ...usage,
      statusCodes: Array.from(usage.statusCodes).sort()
    }));
  }
}
