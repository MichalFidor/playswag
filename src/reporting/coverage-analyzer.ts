import { RequestTracker } from '../core/request-tracker';
import { OpenAPIParser } from '../parsers/openapi';
import { OpenAPIEndpoint } from '../types/openapi';
import { RequestInfo } from '../types/request';
import { CoverageReport, EndpointMatch } from '../types/coverage';
import { extractPath } from '../utils/url';
import { 
  getMethodEmoji, 
  getCoverageEmoji, 
  getStatusEmoji, 
  createProgressBar
} from '../formatting/console';



/**
 * Analyzes API coverage by comparing requests to OpenAPI spec
 */
export class CoverageAnalyzer {
  private tracker: RequestTracker;
  private parser: OpenAPIParser;

  /**
   * Creates a new coverage analyzer
   * @param tracker The request tracker containing API calls
   * @param parser The OpenAPI parser with the spec
   */
  constructor(tracker: RequestTracker, parser: OpenAPIParser) {
    this.tracker = tracker;
    this.parser = parser;
  }

  /**
   * Analyzes coverage of API endpoints
   * @param useGlobalData Whether to use global request data (default: false for backward compatibility)
   * @returns Coverage report
   */
  analyze(useGlobalData: boolean = false): CoverageReport {
    const requests = useGlobalData ? this.tracker.getGlobalRequests() : this.tracker.getRequests();
    const specEndpoints = this.parser.getEndpoints();

    const matches = this.matchRequests(requests);
    const coveredEndpoints = this.getCoveredEndpoints(matches);
    const uncoveredEndpoints = this.getUncoveredEndpoints(specEndpoints, coveredEndpoints);
    const extraEndpoints = this.getExtraEndpoints(matches);

    return {
      totalEndpoints: specEndpoints.length,
      coveredEndpoints: coveredEndpoints.length,
      coveragePercentage:
        specEndpoints.length > 0 ? (coveredEndpoints.length / specEndpoints.length) * 100 : 0,
      uncoveredEndpoints,
      extraEndpoints,
      requestSummary: this.generateRequestSummary(requests),
    };
  }

  /**
   * Matches requests to endpoints in the spec
   * @param requests List of requests to match
   * @returns List of endpoint matches
   */
  private matchRequests(requests: RequestInfo[]): EndpointMatch[] {
    return requests.map(request => {
      const path = extractPath(request.url);
      const matchedEndpoints = this.parser.matchPath(path);
      const matchedEndpoint = matchedEndpoints.find(ep => ep.method === request.method);

      return {
        request,
        matchedEndpoint,
        isMatched: !!matchedEndpoint,
      };
    });
  }

  /**
   * Gets the list of covered endpoints
   * @param matches List of endpoint matches
   * @returns List of covered endpoints
   */
  private getCoveredEndpoints(matches: EndpointMatch[]): OpenAPIEndpoint[] {
    const covered = new Set<string>();
    const result: OpenAPIEndpoint[] = [];

    matches.forEach(match => {
      if (match.matchedEndpoint) {
        const key = `${match.matchedEndpoint.method} ${match.matchedEndpoint.path}`;
        if (!covered.has(key)) {
          covered.add(key);
          result.push(match.matchedEndpoint);
        }
      }
    });

    return result;
  }

  /**
   * Gets the list of uncovered endpoints
   * @param specEndpoints List of all endpoints in the spec
   * @param coveredEndpoints List of covered endpoints
   * @returns List of uncovered endpoints
   */
  private getUncoveredEndpoints(
    specEndpoints: OpenAPIEndpoint[],
    coveredEndpoints: OpenAPIEndpoint[]
  ): OpenAPIEndpoint[] {
    const coveredKeys = new Set(coveredEndpoints.map(ep => `${ep.method} ${ep.path}`));

    return specEndpoints.filter(ep => !coveredKeys.has(`${ep.method} ${ep.path}`));
  }

  /**
   * Gets the list of endpoints called but not in spec
   * @param matches List of endpoint matches
   * @returns List of extra endpoints
   */
  private getExtraEndpoints(matches: EndpointMatch[]): string[] {
    const extraSet = new Set<string>();

    matches.forEach(match => {
      if (!match.isMatched) {
        const path = extractPath(match.request.url);
        extraSet.add(`${match.request.method} ${path}`);
      }
    });

    return Array.from(extraSet);
  }

  /**
   * Generates a summary of request data
   * @param requests List of requests
   * @returns Request summary
   */
  private generateRequestSummary(requests: RequestInfo[]) {
    const methodDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = {};

    requests.forEach(req => {
      methodDistribution[req.method] = (methodDistribution[req.method] || 0) + 1;
      if (req.status) {
        const statusGroup = `${Math.floor(req.status / 100)}xx`;
        statusDistribution[statusGroup] = (statusDistribution[statusGroup] || 0) + 1;
      }
    });

    return {
      totalRequests: requests.length,
      uniqueEndpoints: this.tracker.getUniqueEndpoints().size,
      methodDistribution,
      statusDistribution,
    };
  }



  /**
   * Prints a coverage report to the console
   * @param report Coverage report to print
   */
  printReport(report: CoverageReport): void {
    const timestamp = new Date().toLocaleString();
    console.log('\n🎯 ================= API COVERAGE REPORT =================');
    console.log(`📅 Generated: ${timestamp}`);
    console.log('=========================================================');
    
    // Coverage overview with visual indicators
    const coverageEmoji = getCoverageEmoji(report.coveragePercentage);
    console.log(`\n${coverageEmoji} COVERAGE OVERVIEW`);
    console.log(`   Coverage: ${report.coveragePercentage.toFixed(2)}% (${report.coveredEndpoints}/${report.totalEndpoints} endpoints)`);
    
    // Coverage status indicator
    if (report.coveragePercentage >= 90) {
      console.log('   Status: ✅ Excellent coverage!');
    } else if (report.coveragePercentage >= 80) {
      console.log('   Status: ✅ Good coverage');
    } else if (report.coveragePercentage >= 60) {
      console.log('   Status: ⚠️  Moderate coverage - consider adding more tests');
    } else if (report.coveragePercentage >= 40) {
      console.log('   Status: ⚠️  Low coverage - more tests needed');
    } else {
      console.log('   Status: ❌ Very low coverage - significant testing gaps');
    }

    // Request summary with enhanced formatting
    console.log('\n📊 REQUEST SUMMARY');
    console.log(`   Total requests: ${report.requestSummary.totalRequests}`);
    console.log(`   Unique endpoints: ${report.requestSummary.uniqueEndpoints}`);

    // Method distribution with better formatting
    if (Object.keys(report.requestSummary.methodDistribution).length > 0) {
      console.log('\n🔧 HTTP METHOD DISTRIBUTION');
      const maxMethodLength = Math.max(...Object.keys(report.requestSummary.methodDistribution).map(m => m.length));
      Object.entries(report.requestSummary.methodDistribution)
        .sort(([,a], [,b]) => b - a)
        .forEach(([method, count]) => {
          const percentage = ((count / report.requestSummary.totalRequests) * 100).toFixed(1);
          const bar = createProgressBar(parseFloat(percentage), 20);
          console.log(`   ${method.padEnd(maxMethodLength)}: ${count.toString().padStart(3)} (${percentage.padStart(5)}%) ${bar}`);
        });
    }

    // Status distribution with color coding
    if (Object.keys(report.requestSummary.statusDistribution).length > 0) {
      console.log('\n📈 STATUS CODE DISTRIBUTION');        Object.entries(report.requestSummary.statusDistribution)
        .sort(([,a], [,b]) => b - a)
        .forEach(([status, count]) => {
          const percentage = ((count / report.requestSummary.totalRequests) * 100).toFixed(1);
          const statusEmoji = getStatusEmoji(status);
          const bar = createProgressBar(parseFloat(percentage), 20);
          console.log(`   ${statusEmoji} ${status}: ${count.toString().padStart(3)} (${percentage.padStart(5)}%) ${bar}`);
        });
    }

    // Uncovered endpoints with better organization
    if (report.uncoveredEndpoints.length > 0) {
      console.log('\n❌ UNCOVERED ENDPOINTS');
      
      // Group by tags for better organization
      const uncoveredByTag = this.groupEndpointsByTags(report.uncoveredEndpoints);
      
      Object.entries(uncoveredByTag).forEach(([tag, endpoints]) => {
        console.log(`\n   📝 ${tag.toUpperCase()} (${endpoints.length} endpoints)`);
        endpoints.forEach(ep => {
          const methodColor = getMethodEmoji(ep.method);
          console.log(`      ${methodColor} ${ep.method.padEnd(6)} ${ep.path.padEnd(30)} - ${ep.summary || 'No description'}`);
        });
      });
    } else {
      console.log('\n✅ ALL ENDPOINTS COVERED - Great job!');
    }

    // Extra endpoints (not in spec)
    if (report.extraEndpoints.length > 0) {
      console.log('\n🔍 EXTRA ENDPOINTS (Not in OpenAPI spec)');
      report.extraEndpoints.forEach(ep => {
        console.log(`   ❓ ${ep} - Consider adding to OpenAPI specification`);
      });
    }

    // Recommendations section
    console.log('\n💡 RECOMMENDATIONS');
    if (report.uncoveredEndpoints.length > 0) {
      const criticalEndpoints = report.uncoveredEndpoints.filter(ep => 
        ep.method === 'POST' || ep.method === 'PUT' || ep.method === 'DELETE'
      );
      if (criticalEndpoints.length > 0) {
        console.log(`   🔥 ${criticalEndpoints.length} critical endpoints (POST/PUT/DELETE) need testing`);
      }
      
      const adminEndpoints = report.uncoveredEndpoints.filter(ep => 
        ep.tags?.includes('admin') || ep.tags?.includes('Admin')
      );
      if (adminEndpoints.length > 0) {
        console.log(`   🔐 ${adminEndpoints.length} admin endpoints need testing`);
      }
    }

    if (report.extraEndpoints.length > 0) {
      console.log(`   📋 ${report.extraEndpoints.length} endpoints should be documented in OpenAPI spec`);
    }

    if (report.coveragePercentage < 80) {
      console.log('   📈 Consider adding more test cases to improve coverage');
    }

    console.log('\n=========================================================');
  }

  /**
   * Groups endpoints by their tags for better organization
   */
  private groupEndpointsByTags(endpoints: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};
    
    endpoints.forEach(endpoint => {
      const tags = endpoint.tags && endpoint.tags.length > 0 ? endpoint.tags : ['untagged'];
      tags.forEach((tag: string) => {
        if (!grouped[tag]) {
          grouped[tag] = [];
        }
        if (!grouped[tag].some(ep => ep.method === endpoint.method && ep.path === endpoint.path)) {
          grouped[tag].push(endpoint);
        }
      });
    });
    
    return grouped;
  }


}
