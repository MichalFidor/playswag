/**
 * Recommendation engine for generating actionable insights
 */

import { CoverageReport, ErrorAnalysis } from '../types/coverage';

/**
 * Generates recommendations based on coverage and error analysis
 */
export class RecommendationEngine {
  /**
   * Generate recommendations based on analysis data
   */
  static generateRecommendations(
    coverageReport: CoverageReport, 
    errorAnalysis: ErrorAnalysis
  ): string[] {
    const recommendations: string[] = [];

    // Coverage-based recommendations
    if (coverageReport.coveragePercentage < 50) {
      recommendations.push('Low API coverage detected. Consider adding more test cases to cover untested endpoints.');
    } else if (coverageReport.coveragePercentage < 80) {
      recommendations.push('Good coverage achieved. Focus on edge cases and error scenarios for remaining endpoints.');
    } else {
      recommendations.push('Excellent coverage! Consider performance testing and load testing scenarios.');
    }

    // Error-based recommendations
    if (errorAnalysis.errorRate > 10) {
      recommendations.push(`High error rate (${errorAnalysis.errorRate}%). Review failing endpoints and fix underlying issues.`);
    }

    // Extra endpoints recommendation
    if (coverageReport.extraEndpoints.length > 0) {
      recommendations.push(`${coverageReport.extraEndpoints.length} endpoints are not documented in OpenAPI spec. Consider updating documentation.`);
    }

    // Critical endpoints recommendation
    const criticalUncovered = coverageReport.uncoveredEndpoints.filter((ep: any) => 
      ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'DELETE'
    );
    if (criticalUncovered.length > 0) {
      recommendations.push(`${criticalUncovered.length} critical endpoints (POST/PUT/DELETE) are untested. Prioritize testing these operations.`);
    }

    // Admin endpoints recommendation
    const adminUncovered = coverageReport.uncoveredEndpoints.filter((ep: any) => 
      ep.tags?.includes('admin') || ep.tags?.includes('Admin')
    );
    if (adminUncovered.length > 0) {
      recommendations.push(`${adminUncovered.length} admin endpoints are untested. Ensure admin functionality is properly tested.`);
    }

    return recommendations;
  }
}
