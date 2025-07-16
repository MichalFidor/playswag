import { APIRequestContext, APIResponse } from '@playwright/test';
import { writeFileSync } from 'fs';
import { RequestInfo, APIRequestOptions } from '../types/request';
import { ExportOptions } from '../types/export';
import { extractPath } from '../utils/url';



/**
 * Global singleton store for tracking requests across all PlaySwag instances
 */
class GlobalRequestStore {
  private static instance: GlobalRequestStore;
  private requests: RequestInfo[] = [];

  private constructor() {}

  /**
   * Get the singleton instance
   */
  static getInstance(): GlobalRequestStore {
    if (!GlobalRequestStore.instance) {
      GlobalRequestStore.instance = new GlobalRequestStore();
    }
    return GlobalRequestStore.instance;
  }

  /**
   * Add a request to the global store
   */
  addRequest(request: RequestInfo): void {
    this.requests.push(request);
  }

  /**
   * Get all requests from the global store
   */
  getRequests(): RequestInfo[] {
    return [...this.requests];
  }

  /**
   * Clear all requests from the global store
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Get the count of all tracked requests
   */
  getRequestCount(): number {
    return this.requests.length;
  }
}



/**
 * Wraps Playwright's APIRequestContext to track API requests
 */
export class RequestTracker {
  private requests: RequestInfo[] = [];
  private context: APIRequestContext;
  private globalStore: GlobalRequestStore;
  private useGlobalTracking: boolean;

  /**
   * Creates a new RequestTracker
   * @param context Playwright API request context to wrap
   * @param useGlobalTracking Whether to use global request tracking across instances (default: true)
   */
  constructor(context: APIRequestContext, useGlobalTracking: boolean = true) {
    this.context = context;
    this.globalStore = GlobalRequestStore.getInstance();
    this.useGlobalTracking = useGlobalTracking;
  }

  /**
   * Tracks an API request and its response
   */
  private async trackRequest(
    method: string,
    url: string,
    options: APIRequestOptions = {},
    requestFn: () => Promise<APIResponse>
  ): Promise<APIResponse> {
    const startTime = Date.now();

    const requestInfo: RequestInfo = {
      method: method.toUpperCase(),
      url,
      timestamp: startTime,
      params: options.params,
      headers: options.headers,
    };

    try {
      const response = await requestFn();

      requestInfo.status = response.status();
      requestInfo.duration = Date.now() - startTime;

      // Store in local array for backward compatibility
      this.requests.push(requestInfo);
      
      // Store in global store if enabled
      if (this.useGlobalTracking) {
        this.globalStore.addRequest(requestInfo);
      }

      return response;
    } catch (error) {
      requestInfo.duration = Date.now() - startTime;
      
      // Store in local array for backward compatibility
      this.requests.push(requestInfo);
      
      // Store in global store if enabled
      if (this.useGlobalTracking) {
        this.globalStore.addRequest(requestInfo);
      }
      
      throw error;
    }
  }

  /**
   * Performs a GET request
   */
  async get(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('GET', url, options, () => this.context.get(url, options));
  }

  /**
   * Performs a POST request
   */
  async post(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('POST', url, options, () => this.context.post(url, options));
  }

  /**
   * Performs a PUT request
   */
  async put(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('PUT', url, options, () => this.context.put(url, options));
  }

  /**
   * Performs a PATCH request
   */
  async patch(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('PATCH', url, options, () => this.context.patch(url, options));
  }

  /**
   * Performs a DELETE request
   */
  async delete(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('DELETE', url, options, () => this.context.delete(url, options));
  }

  /**
   * Performs a HEAD request
   */
  async head(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    return this.trackRequest('HEAD', url, options, () => this.context.head(url, options));
  }

  /**
   * Performs a fetch request
   */
  async fetch(url: string, options?: APIRequestOptions): Promise<APIResponse> {
    const method = options?.method || 'GET';
    return this.trackRequest(method, url, options, () => this.context.fetch(url, options));
  }

  /**
   * Gets all tracked requests from local instance
   */
  getRequests(): RequestInfo[] {
    return [...this.requests];
  }

  /**
   * Gets all tracked requests from the global store (across all instances)
   */
  getGlobalRequests(): RequestInfo[] {
    return this.globalStore.getRequests();
  }

  /**
   * Clears all tracked requests from local instance
   */
  clearRequests(): void {
    this.requests = [];
  }

  /**
   * Clears all tracked requests from the global store
   */
  clearGlobalRequests(): void {
    this.globalStore.clearRequests();
  }

  /**
   * Gets the count of tracked requests from local instance
   */
  getRequestCount(): number {
    return this.requests.length;
  }

  /**
   * Gets the count of tracked requests from the global store
   */
  getGlobalRequestCount(): number {
    return this.globalStore.getRequestCount();
  }

  /**
   * Gets unique endpoints that have been called (local instance)
   */
  getUniqueEndpoints(): Set<string> {
    return new Set(this.requests.map(req => `${req.method} ${extractPath(req.url)}`));
  }

  /**
   * Gets unique endpoints that have been called (global store)
   */
  getGlobalUniqueEndpoints(): Set<string> {
    return new Set(this.globalStore.getRequests().map(req => `${req.method} ${extractPath(req.url)}`));
  }

  /**
   * Enable or disable global tracking for this instance
   */
  setGlobalTracking(enabled: boolean): void {
    this.useGlobalTracking = enabled;
  }

  /**
   * Check if global tracking is enabled for this instance
   */
  isGlobalTrackingEnabled(): boolean {
    return this.useGlobalTracking;
  }

  /**
   * Exports request data to a file
   * @param options Export options
   * @param useGlobalData Whether to export global data (default: false for backward compatibility)
   */
  exportResults(options: ExportOptions, useGlobalData: boolean = false): void {
    let content: string;

    switch (options.format) {
      case 'junit':
        content = this.toJunitXml(options.testSuiteName || 'API Tests', useGlobalData);
        break;
      case 'json':
        content = this.toJson(useGlobalData);
        break;
      case 'csv':
        content = this.toCsv(options.includeHeaders !== false, useGlobalData);
        break;
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }

    writeFileSync(options.filePath, content, 'utf8');
  }

  /**
   * Converts request data to JUnit XML format
   */
  private toJunitXml(suiteName: string, useGlobalData: boolean = false): string {
    const requestsToUse = useGlobalData ? this.globalStore.getRequests() : this.requests;
    const totalTests = requestsToUse.length;
    const failures = requestsToUse.filter(req => req.status && req.status >= 400).length;
    const totalTime = requestsToUse.reduce((sum, req) => sum + (req.duration || 0), 0) / 1000;

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuite name="${suiteName}" tests="${totalTests}" failures="${failures}" time="${totalTime}">\n`;

    requestsToUse.forEach(req => {
      const testName = `${req.method} ${extractPath(req.url)}`;
      const time = (req.duration || 0) / 1000;
      const isFailure = req.status && req.status >= 400;

      xml += `  <testcase name="${testName}" time="${time}" classname="API.${req.method}"`;

      if (isFailure) {
        xml += `>\n    <failure message="HTTP ${req.status}" type="HttpError">Request failed with status ${req.status}</failure>\n  </testcase>\n`;
      } else {
        xml += ` />\n`;
      }
    });

    xml += `</testsuite>`;
    return xml;
  }

  /**
   * Converts request data to JSON format
   */
  private toJson(useGlobalData: boolean = false): string {
    const requestsToUse = useGlobalData ? this.globalStore.getRequests() : this.requests;
    const uniqueEndpoints = useGlobalData ? this.getGlobalUniqueEndpoints() : this.getUniqueEndpoints();
    const summary = {
      totalRequests: requestsToUse.length,
      uniqueEndpoints: uniqueEndpoints.size,
      successRate: this.getSuccessRate(useGlobalData),
      averageDuration: this.getAverageDuration(useGlobalData),
      timestamp: new Date().toISOString(),
    };

    return JSON.stringify(
      {
        summary,
        requests: requestsToUse,
      },
      null,
      2
    );
  }

  /**
   * Converts request data to CSV format
   */
  private toCsv(includeHeaders = true, useGlobalData: boolean = false): string {
    const requestsToUse = useGlobalData ? this.globalStore.getRequests() : this.requests;
    const headers = ['Method', 'URL', 'Status', 'Duration(ms)', 'Timestamp'];
    let csv = '';

    if (includeHeaders) {
      csv += headers.join(',') + '\n';
    }

    requestsToUse.forEach(req => {
      const row = [
        req.method,
        `"${req.url}"`,
        req.status || 'N/A',
        req.duration || 'N/A',
        new Date(req.timestamp).toISOString(),
      ];
      csv += row.join(',') + '\n';
    });

    return csv;
  }

  /**
   * Calculates the success rate of requests
   */
  private getSuccessRate(useGlobalData: boolean = false): number {
    const requestsToUse = useGlobalData ? this.globalStore.getRequests() : this.requests;
    if (requestsToUse.length === 0) return 0;
    const successful = requestsToUse.filter(req => req.status && req.status < 400).length;
    return Math.round((successful / requestsToUse.length) * 100 * 100) / 100;
  }

  /**
   * Calculates the average duration of requests
   */
  private getAverageDuration(useGlobalData: boolean = false): number {
    const requestsToUse = useGlobalData ? this.globalStore.getRequests() : this.requests;
    if (requestsToUse.length === 0) return 0;
    const totalDuration = requestsToUse.reduce((sum, req) => sum + (req.duration || 0), 0);
    return Math.round((totalDuration / requestsToUse.length) * 100) / 100;
  }



  /**
   * Export comprehensive summary including coverage data (requires analyzer)
   */
  exportComprehensiveSummary(filePath: string, analyzer?: any): void {
    if (!analyzer) {
      // If no analyzer provided, export basic summary
      this.exportResults({ format: 'json', filePath });
      return;
    }

    const report = analyzer.analyze();
    const timestamp = new Date();

    // Enhanced summary with more details
    const comprehensiveSummary = {
      metadata: {
        generatedAt: timestamp.toISOString(),
        generatedBy: 'PlaySwag',
        version: '1.0.0',
        exportType: 'comprehensive',
      },
      coverage: report,
      requests: this.requests,
      summary: {
        totalRequests: this.requests.length,
        uniqueEndpoints: this.getUniqueEndpoints().size,
        successRate: this.getSuccessRate(),
        averageDuration: this.getAverageDuration(),
        timeRange:
          this.requests.length > 0
            ? {
                start: new Date(Math.min(...this.requests.map(r => r.timestamp))).toISOString(),
                end: new Date(Math.max(...this.requests.map(r => r.timestamp))).toISOString(),
                duration:
                  Math.max(...this.requests.map(r => r.timestamp)) -
                  Math.min(...this.requests.map(r => r.timestamp)),
              }
            : null,
      },
    };

    const content = JSON.stringify(comprehensiveSummary, null, 2);
    writeFileSync(filePath, content, 'utf8');
    console.log(`📄 Comprehensive summary exported to: ${filePath}`);
  }
}
