import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';

test.describe('Coverage Reporting Features', () => {
  test('should generate comprehensive coverage reports', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    // Create a complex mock spec for testing
    const complexSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Complex API',
        version: '2.0.0',
        description: 'A complex API for testing coverage reporting'
      },
      servers: [
        { url: 'https://api.complex.com' }
      ],
      paths: {
        '/users': {
          get: {
            operationId: 'listUsers',
            summary: 'List all users',
            tags: ['users', 'admin']
          },
          post: {
            operationId: 'createUser',
            summary: 'Create a new user',
            tags: ['users']
          }
        },
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            summary: 'Get user by ID',
            tags: ['users']
          },
          put: {
            operationId: 'updateUser',
            summary: 'Update user completely',
            tags: ['users']
          },
          patch: {
            operationId: 'patchUser',
            summary: 'Partial user update',
            tags: ['users']
          },
          delete: {
            operationId: 'deleteUser',
            summary: 'Delete user',
            tags: ['users', 'admin']
          }
        },
        '/users/{id}/posts': {
          get: {
            operationId: 'getUserPosts',
            summary: 'Get posts by user',
            tags: ['posts', 'users']
          }
        },
        '/posts': {
          get: {
            operationId: 'listPosts',
            summary: 'List all posts',
            tags: ['posts']
          },
          post: {
            operationId: 'createPost',
            summary: 'Create a new post',
            tags: ['posts']
          }
        },
        '/posts/{id}': {
          get: {
            operationId: 'getPost',
            summary: 'Get post by ID',
            tags: ['posts']
          },
          delete: {
            operationId: 'deletePost',
            summary: 'Delete post',
            tags: ['posts', 'admin']
          }
        },
        '/posts/{id}/comments': {
          get: {
            operationId: 'getPostComments',
            summary: 'Get comments for a post',
            tags: ['comments']
          },
          post: {
            operationId: 'createPostComment',
            summary: 'Add comment to post',
            tags: ['comments']
          }
        },
        '/comments/{id}': {
          get: {
            operationId: 'getComment',
            summary: 'Get comment by ID',
            tags: ['comments']
          },
          patch: {
            operationId: 'updateComment',
            summary: 'Update comment',
            tags: ['comments']
          },
          delete: {
            operationId: 'deleteComment',
            summary: 'Delete comment',
            tags: ['comments', 'admin']
          }
        },
        '/admin/stats': {
          get: {
            operationId: 'getStats',
            summary: 'Get system statistics',
            tags: ['admin']
          }
        },
        '/health': {
          get: {
            operationId: 'healthCheck',
            summary: 'Health check endpoint',
            tags: ['system']
          }
        }
      }
    };

    const fs = require('fs');
    const path = require('path');
    const specPath = path.join(__dirname, 'complex-api-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(complexSpec, null, 2));

    try {
      // Load the complex spec
      playswag.loadSpecFromFile(specPath);

      console.log('Testing coverage reporting with complex API...');

      // Simulate various API calls
      const mockRequests = [
        { method: 'GET', url: 'https://api.complex.com/users', status: 200 },
        { method: 'POST', url: 'https://api.complex.com/users', status: 201 },
        { method: 'GET', url: 'https://api.complex.com/users/123', status: 200 },
        { method: 'PUT', url: 'https://api.complex.com/users/123', status: 200 },
        { method: 'GET', url: 'https://api.complex.com/users/123/posts', status: 200 },
        { method: 'GET', url: 'https://api.complex.com/posts', status: 200 },
        { method: 'GET', url: 'https://api.complex.com/posts/456', status: 200 },
        { method: 'GET', url: 'https://api.complex.com/posts/456/comments', status: 200 },
        { method: 'POST', url: 'https://api.complex.com/posts/456/comments', status: 201 },
        { method: 'GET', url: 'https://api.complex.com/health', status: 200 },
        // Add some endpoints not in spec
        { method: 'GET', url: 'https://api.complex.com/nonexistent', status: 404 },
        { method: 'POST', url: 'https://api.complex.com/unknown/endpoint', status: 404 }
      ];

      // Add mock requests to tracker (for testing purposes)
      const tracker = playswag.request;
      mockRequests.forEach(req => {
        const requestInfo = {
          method: req.method,
          url: req.url,
          timestamp: Date.now(),
          status: req.status,
          duration: Math.floor(Math.random() * 200) + 50
        };
        // Access private property for testing
        (tracker as any).requests.push(requestInfo);
      });

      // Generate comprehensive coverage report
      const report = playswag.generateReport();

      console.log('\n=== Comprehensive Coverage Analysis ===');
      console.log(`API: ${complexSpec.info.title} v${complexSpec.info.version}`);
      console.log(`Total endpoints in spec: ${report.totalEndpoints}`);
      console.log(`Covered endpoints: ${report.coveredEndpoints}`);
      console.log(`Coverage percentage: ${report.coveragePercentage.toFixed(2)}%`);
      console.log(`Total requests made: ${report.requestSummary.totalRequests}`);
      console.log(`Unique endpoints tested: ${report.requestSummary.uniqueEndpoints}`);

      // Method distribution analysis
      console.log('\n--- HTTP Method Distribution ---');
      Object.entries(report.requestSummary.methodDistribution)
        .sort(([,a], [,b]) => b - a)
        .forEach(([method, count]) => {
          const percentage = ((count / report.requestSummary.totalRequests) * 100).toFixed(1);
          console.log(`${method.padEnd(6)}: ${count.toString().padStart(3)} requests (${percentage}%)`);
        });

      // Status code analysis
      console.log('\n--- HTTP Status Distribution ---');
      Object.entries(report.requestSummary.statusDistribution)
        .sort(([,a], [,b]) => b - a)
        .forEach(([status, count]) => {
          const percentage = ((count / report.requestSummary.totalRequests) * 100).toFixed(1);
          const statusText = getStatusText(parseInt(status));
          console.log(`${status} ${statusText}: ${count} requests (${percentage}%)`);
        });

      // Uncovered endpoints analysis
      if (report.uncoveredEndpoints.length > 0) {
        console.log('\n--- Uncovered Endpoints ---');
        const uncoveredByTag = groupByTag(report.uncoveredEndpoints);
        Object.entries(uncoveredByTag).forEach(([tag, endpoints]) => {
          console.log(`\n${tag.toUpperCase()} endpoints:`);
          endpoints.forEach(endpoint => {
            console.log(`  ${endpoint.method.padEnd(6)} ${endpoint.path.padEnd(25)} - ${endpoint.summary}`);
          });
        });
      }

      // Extra endpoints (not in spec)
      if (report.extraEndpoints.length > 0) {
        console.log('\n--- Extra Endpoints (Not in Spec) ---');
        report.extraEndpoints.forEach(endpoint => {
          console.log(`  ${endpoint} - Should this be added to the spec?`);
        });
      }

      // Coverage recommendations
      console.log('\n--- Coverage Recommendations ---');
      if (report.coveragePercentage < 50) {
        console.log('📈 Coverage is low. Consider adding more test cases.');
      } else if (report.coveragePercentage < 80) {
        console.log('📊 Good coverage! Consider testing edge cases and error scenarios.');
      } else {
        console.log('🎯 Excellent coverage! Consider testing performance and edge cases.');
      }

      if (report.extraEndpoints.length > 0) {
        console.log('📝 Some endpoints are not documented in the OpenAPI spec.');
      }

      const adminEndpoints = report.uncoveredEndpoints.filter(ep => 
        ep.tags?.includes('admin')
      );
      if (adminEndpoints.length > 0) {
        console.log(`🔐 ${adminEndpoints.length} admin endpoints are not tested.`);
      }

      // Export detailed reports
      const exportDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir);
      }

      // Export as JSON
      playswag.request.exportResults({
        format: 'json',
        filePath: path.join(exportDir, 'coverage-report.json')
      });

      // Export as CSV
      playswag.request.exportResults({
        format: 'csv',
        filePath: path.join(exportDir, 'requests.csv'),
        includeHeaders: true
      });

      // Export as JUnit XML
      playswag.request.exportResults({
        format: 'junit',
        filePath: path.join(exportDir, 'test-results.xml'),
        testSuiteName: 'API Coverage Tests'
      });

      console.log(`\n📄 Reports exported to: ${exportDir}`);

      // Print the standard PlaySwag report
      console.log('\n=== Standard PlaySwag Report ===');
      playswag.printReport();

      // Assertions
      expect(report.totalEndpoints).toBe(18); // Based on our complex spec (corrected count)
      expect(report.requestSummary.totalRequests).toBe(12);
      expect(report.coveragePercentage).toBeGreaterThan(0);
      expect(report.extraEndpoints.length).toBe(2); // We added 2 non-spec endpoints

      // Clean up
      fs.unlinkSync(specPath);
      fs.rmSync(exportDir, { recursive: true, force: true });

    } catch (error) {
      console.error('Coverage reporting test failed:', error);
      
      // Clean up on error
      if (fs.existsSync(specPath)) {
        fs.unlinkSync(specPath);
      }
      throw error;
    }

    await apiContext.dispose();
  });
});

// Helper functions
function getStatusText(status: number): string {
  const statusTexts: Record<number, string> = {
    200: 'OK',
    201: 'Created',
    204: 'No Content',
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error'
  };
  return statusTexts[status] || 'Unknown';
}

function groupByTag(endpoints: any[]): Record<string, any[]> {
  const grouped: Record<string, any[]> = {};
  
  endpoints.forEach(endpoint => {
    const tags = endpoint.tags || ['untagged'];
    tags.forEach((tag: string) => {
      if (!grouped[tag]) {
        grouped[tag] = [];
      }
      grouped[tag].push(endpoint);
    });
  });
  
  return grouped;
}
