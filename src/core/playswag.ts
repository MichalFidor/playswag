import { APIRequestContext } from '@playwright/test';
import { RequestTracker } from './request-tracker';
import { OpenAPIParser } from '../parsers/openapi';
import { CoverageAnalyzer } from '../reporting/coverage-analyzer';
import { SummaryGenerator } from './summary-generator';
import { RequestInfo } from '../types/request';
import { 
  ComprehensiveSummary 
} from '../types/coverage';


/**
 * Main PlaySwag class that integrates Playwright's API testing capabilities
 * with OpenAPI/Swagger specification for coverage analysis.
 */
export class PlaySwag {
  private tracker: RequestTracker;
  private parser?: OpenAPIParser;
  private analyzer?: CoverageAnalyzer;

  /**
   * Creates a new PlaySwag instance
   * @param context Playwright API request context to wrap
   * @param useGlobalTracking Whether to use global request tracking across instances (default: true)
   */
  constructor(context: APIRequestContext, useGlobalTracking: boolean = true) {
    this.tracker = new RequestTracker(context, useGlobalTracking);
  }

  /**
   * Get the wrapped request tracker
   */
  get request(): RequestTracker {
    return this.tracker;
  }

  /**
   * Load OpenAPI spec from URL
   * @param url URL to the OpenAPI/Swagger JSON spec
   */
  async loadSpecFromUrl(url: string): Promise<void> {
    this.parser = await OpenAPIParser.fromUrl(url);
    this.analyzer = new CoverageAnalyzer(this.tracker, this.parser);
  }

  /**
   * Load OpenAPI spec from file
   * @param filePath Path to the OpenAPI/Swagger JSON file
   */
  loadSpecFromFile(filePath: string): void {
    this.parser = OpenAPIParser.fromFile(filePath);
    this.analyzer = new CoverageAnalyzer(this.tracker, this.parser);
  }

  /**
   * Generate coverage report
   * @param useGlobalData Whether to use global request data for analysis (default: false for backward compatibility)
   * @returns Coverage report object
   */
  generateReport(useGlobalData: boolean = false): ReturnType<CoverageAnalyzer['analyze']> {
    if (!this.analyzer) {
      throw new Error(
        'OpenAPI spec not loaded. Call loadSpecFromUrl() or loadSpecFromFile() first.'
      );
    }
    return this.analyzer.analyze(useGlobalData);
  }

  /**
   * Print coverage report to console
   * @param useGlobalData Whether to use global request data for the report (default: false for backward compatibility)
   */
  printReport(useGlobalData: boolean = false): void {
    const report = this.generateReport(useGlobalData);
    if (this.analyzer) {
      this.analyzer.printReport(report);

      // Print covered endpoints with enhanced table format
      console.log('\n📋 COVERED ENDPOINTS DETAIL');
      const requests = useGlobalData ? this.tracker.getGlobalRequests() : this.tracker.getRequests();
      const endpointUsage = new Map<string, { method: string; url: string; count: number; avgDuration: number; statuses: Set<number> }>();

      requests.forEach((req: any) => {
        const key = `${req.method.toUpperCase()}:${req.url}`;
        const existing = endpointUsage.get(key);
        if (existing) {
          existing.count++;
          existing.avgDuration = (existing.avgDuration + (req.duration || 0)) / 2;
          if (req.status) existing.statuses.add(req.status);
        } else {
          endpointUsage.set(key, {
            method: req.method.toUpperCase(),
            url: req.url,
            count: 1,
            avgDuration: req.duration || 0,
            statuses: new Set(req.status ? [req.status] : [])
          });
        }
      });

      if (endpointUsage.size === 0) {
        console.log('   No endpoints covered yet.');
      } else {
        // Calculate column widths for better formatting
        const entries = Array.from(endpointUsage.values());
        const methodWidth = Math.max(6, ...entries.map(e => e.method.length));
        const urlWidth = Math.max(8, ...entries.map(e => Math.min(e.url.length, 50))); // Cap URL width
        const countWidth = 5;
        const durationWidth = 8;
        const statusWidth = 12;

        // Print enhanced table header
        const separator = `+${'-'.repeat(methodWidth + 2)}+${'-'.repeat(urlWidth + 2)}+${'-'.repeat(countWidth + 2)}+${'-'.repeat(durationWidth + 2)}+${'-'.repeat(statusWidth + 2)}+`;
        console.log(separator);
        console.log(
          `| ${'Method'.padEnd(methodWidth)} | ${'Endpoint'.padEnd(urlWidth)} | ${'Count'.padEnd(countWidth)} | ${'Avg(ms)'.padEnd(durationWidth)} | ${'Statuses'.padEnd(statusWidth)} |`
        );
        console.log(separator);

        // Sort entries by count (most used first)
        entries
          .sort((a, b) => b.count - a.count)
          .forEach(({ method, url, count, avgDuration, statuses }) => {
            const truncatedUrl = url.length > 50 ? url.substring(0, 47) + '...' : url;
            const statusList = Array.from(statuses).sort().join(',');
            const avgDurationStr = Math.round(avgDuration).toString();
            
            console.log(
              `| ${method.padEnd(methodWidth)} | ${truncatedUrl.padEnd(urlWidth)} | ${count.toString().padEnd(countWidth)} | ${avgDurationStr.padEnd(durationWidth)} | ${statusList.padEnd(statusWidth)} |`
            );
          });
        console.log(separator);
        
        // Summary stats
        const totalRequests = entries.reduce((sum, e) => sum + e.count, 0);
        const avgDuration = Math.round(entries.reduce((sum, e) => sum + e.avgDuration, 0) / entries.length);
        console.log(`\n📊 ENDPOINT USAGE SUMMARY`);
        console.log(`   Total unique endpoints: ${entries.length}`);
        console.log(`   Total requests: ${totalRequests}`);
        console.log(`   Average response time: ${avgDuration}ms`);
        
        // Most used endpoint
        const mostUsed = entries[0];
        console.log(`   Most tested: ${mostUsed.method} ${mostUsed.url} (${mostUsed.count} calls)`);
      }
    }
  }

  /**
   * Get raw request data
   * @returns Array of tracked requests
   */
  getRequests(): RequestInfo[] {
    return this.tracker.getRequests();
  }

  /**
   * Get all requests from the global store (across all instances)
   * @returns Array of all tracked requests from global store
   */
  getGlobalRequests(): RequestInfo[] {
    return this.tracker.getGlobalRequests();
  }

  /**
   * Clear collected requests
   */
  clearRequests(): void {
    this.tracker.clearRequests();
  }

  /**
   * Clear all requests from the global store (affects all instances)
   */
  clearGlobalRequests(): void {
    this.tracker.clearGlobalRequests();
  }

  /**
   * Generate a comprehensive summary with coverage and request data
   * @param useGlobalData Whether to use global request data (default: false)
   * @returns Comprehensive summary object
   */
  generateComprehensiveSummary(useGlobalData: boolean = false): ComprehensiveSummary {
    if (!this.analyzer) {
      throw new Error(
        'OpenAPI spec not loaded. Call loadSpecFromUrl() or loadSpecFromFile() first.'
      );
    }
    return SummaryGenerator.generateComprehensiveSummary(this.tracker, this.analyzer, useGlobalData);
  }

  /**
   * Export comprehensive summary to JSON file
   * @param filePath Path to save the JSON file
   * @param prettify Whether to format JSON with indentation
   */
  exportComprehensiveSummary(filePath: string, prettify: boolean = true): void {
    const summary = this.generateComprehensiveSummary();
    const content = JSON.stringify(summary, null, prettify ? 2 : 0);
    
    const fs = require('fs');
    const path = require('path');
    
    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`\n💾 Comprehensive summary exported to: ${filePath}`);
  }



  /**
   * Print enhanced summary with better formatting and export options
   * @param options Configuration for summary display and export
   */
  printEnhancedSummary(options?: {
    exportJson?: string;
    exportComprehensive?: string;
    showRecommendations?: boolean;
    showPerformanceMetrics?: boolean;
  }): void {
    const opts = {
      showRecommendations: true,
      showPerformanceMetrics: true,
      ...options
    };

    // Print the enhanced report
    this.printReport();

    // Export JSON if requested
    if (opts.exportJson) {
      this.request.exportResults({
        format: 'json',
        filePath: opts.exportJson
      });
    }

    // Export comprehensive summary if requested
    if (opts.exportComprehensive) {
      this.exportComprehensiveSummary(opts.exportComprehensive);
    }

    // Show additional insights
    if (opts.showRecommendations || opts.showPerformanceMetrics) {
      const summary = this.generateComprehensiveSummary();
      
      if (opts.showPerformanceMetrics && summary.performanceMetrics) {
        console.log('\n⚡ PERFORMANCE METRICS');
        console.log(`   Average response time: ${summary.performanceMetrics.averageResponseTime}ms`);
        console.log(`   Min response time: ${summary.performanceMetrics.minResponseTime}ms`);
        console.log(`   Max response time: ${summary.performanceMetrics.maxResponseTime}ms`);
        console.log(`   95th percentile: ${summary.performanceMetrics.p95ResponseTime}ms`);
        console.log(`   99th percentile: ${summary.performanceMetrics.p99ResponseTime}ms`);
      }

      if (opts.showRecommendations && summary.recommendations.length > 0) {
        console.log('\n💡 RECOMMENDATIONS');
        summary.recommendations.forEach((rec, index) => {
          console.log(`   ${index + 1}. ${rec}`);
        });
      }

      if (summary.errorAnalysis.totalErrors > 0) {
        console.log('\n🚨 ERROR ANALYSIS');
        console.log(`   Total errors: ${summary.errorAnalysis.totalErrors}`);
        console.log(`   Error rate: ${summary.errorAnalysis.errorRate}%`);
        
        if (summary.errorAnalysis.mostCommonErrors.length > 0) {
          console.log('   Most common errors:');
          summary.errorAnalysis.mostCommonErrors.forEach(error => {
            console.log(`     ${error.status}: ${error.count} occurrences (${error.percentage}%)`);
          });
        }
      }
    }

    console.log('\n=========================================================');
  }

  /**
   * Enable or disable global tracking for this instance
   */
  setGlobalTracking(enabled: boolean): void {
    this.tracker.setGlobalTracking(enabled);
  }

  /**
   * Check if global tracking is enabled for this instance
   */
  isGlobalTrackingEnabled(): boolean {
    return this.tracker.isGlobalTrackingEnabled();
  }

  /**
   * Generate comprehensive coverage summary using global data
   * Convenience method for generateComprehensiveSummary(true)
   * @returns Comprehensive summary object using global data
   */
  generateGlobalComprehensiveSummary(): ComprehensiveSummary {
    return this.generateComprehensiveSummary(true);
  }
}

/**
 * Helper function to create PlaySwag instance
 * @param context Playwright API request context
 * @param useGlobalTracking Whether to use global request tracking across instances (default: true)
 * @returns PlaySwag instance
 */
export function createPlaySwag(context: APIRequestContext, useGlobalTracking: boolean = true): PlaySwag {
  return new PlaySwag(context, useGlobalTracking);
}
