/**
 * Types related to coverage analysis and reporting
 */

import { OpenAPIEndpoint } from './openapi';
import { RequestInfo } from './request';

/**
 * Coverage report data structure
 */
export interface CoverageReport {
  /** Total number of endpoints in the spec */
  totalEndpoints: number;
  /** Number of covered endpoints */
  coveredEndpoints: number;
  /** Coverage percentage (0-100) */
  coveragePercentage: number;
  /** List of endpoints not covered by tests */
  uncoveredEndpoints: OpenAPIEndpoint[];
  /** List of endpoints called but not in spec */
  extraEndpoints: string[];
  /** Summary of request data */
  requestSummary: {
    totalRequests: number;
    uniqueEndpoints: number;
    methodDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
  };
}

/**
 * Represents a match between a request and an endpoint
 */
export interface EndpointMatch {
  /** The request that was made */
  request: RequestInfo;
  /** The matched endpoint, if any */
  matchedEndpoint?: OpenAPIEndpoint;
  /** Whether the request matched an endpoint in the spec */
  isMatched: boolean;
}

/**
 * Endpoint usage statistics for internal processing
 */
export interface EndpointUsageInternal {
  endpoint: string;
  callCount: number;
  totalDuration: number;
  averageDuration: number;
  statusCodes: Set<number>;
  firstCalled: number;
  lastCalled: number;
}

/**
 * Endpoint usage statistics for export (serializable)
 */
export interface EndpointUsage {
  endpoint: string;
  callCount: number;
  totalDuration: number;
  averageDuration: number;
  statusCodes: number[];
  firstCalled: number;
  lastCalled: number;
}

/**
 * Performance metrics for API calls
 */
export interface PerformanceMetrics {
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  p99ResponseTime: number;
}

/**
 * Error analysis data
 */
export interface ErrorAnalysis {
  totalErrors: number;
  errorRate: number;
  errorsByStatus: Record<string, number>;
  mostCommonErrors: Array<{
    status: string;
    count: number;
    percentage: number;
  }>;
}

/**
 * Comprehensive summary including coverage, performance, and usage data
 */
export interface ComprehensiveSummary {
  metadata: {
    generatedAt: string;
    generatedBy: string;
    version: string;
    sessionDuration: number;
  };
  coverage: CoverageReport;
  requestSummary: {
    totalRequests: number;
    uniqueEndpoints: number;
    timeRange: {
      start: string;
      end: string;
    } | null;
    methodDistribution: Record<string, number>;
    statusDistribution: Record<string, number>;
  };
  endpointUsage: EndpointUsage[];
  performanceMetrics: PerformanceMetrics | null;
  errorAnalysis: ErrorAnalysis;
  recommendations: string[];
}

// Import RequestInfo type - this will be moved from request-tracker
