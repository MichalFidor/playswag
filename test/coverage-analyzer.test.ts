/**
 * Unit tests for CoverageAnalyzer functionality
 */

import { test, expect, request } from '@playwright/test';
import { CoverageAnalyzer } from '../src/reporting/coverage-analyzer';
import { RequestTracker } from '../src/core/request-tracker';
import { OpenAPIParser } from '../src/parsers/openapi';

test.describe('CoverageAnalyzer', () => {
  const mockOpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0'
    },
    servers: [
      { url: 'https://api.test.com' }
    ],
    paths: {
      '/users': {
        get: {
          operationId: 'getUsers',
          summary: 'Get all users',
          tags: ['users']
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
          summary: 'Update user',
          tags: ['users']
        },
        delete: {
          operationId: 'deleteUser',
          summary: 'Delete user',
          tags: ['users', 'admin']
        }
      },
      '/posts': {
        get: {
          operationId: 'getPosts',
          summary: 'Get all posts',
          tags: ['posts']
        }
      }
    }
  };

  test('should create analyzer instance', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    
    const analyzer = new CoverageAnalyzer(tracker, parser);
    expect(analyzer).toBeDefined();
    
    await apiContext.dispose();
  });

  test('should analyze coverage with no requests', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    const report = analyzer.analyze();

    expect(report.totalEndpoints).toBe(6); // Total endpoints in mock spec
    expect(report.coveredEndpoints).toBe(0);
    expect(report.coveragePercentage).toBe(0);
    expect(report.uncoveredEndpoints).toHaveLength(6);
    expect(report.extraEndpoints).toHaveLength(0);
    expect(report.requestSummary.totalRequests).toBe(0);
    expect(report.requestSummary.uniqueEndpoints).toBe(0);

    await apiContext.dispose();
  });

  test('should analyze coverage with matching requests', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    // Add mock requests that match the spec
    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      },
      {
        method: 'POST',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 201,
        duration: 150
      },
      {
        method: 'GET',
        url: 'https://api.test.com/users/123',
        timestamp: Date.now(),
        status: 200,
        duration: 120
      }
    ];

    // Set mock requests directly for testing
    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.totalEndpoints).toBe(6);
    expect(report.coveredEndpoints).toBe(3); // 3 endpoints covered
    expect(report.coveragePercentage).toBe(50); // 3/6 * 100
    expect(report.uncoveredEndpoints).toHaveLength(3);
    expect(report.extraEndpoints).toHaveLength(0);
    expect(report.requestSummary.totalRequests).toBe(3);
    expect(report.requestSummary.uniqueEndpoints).toBe(3); // All 3 requests are to different endpoint-method combinations

    // Check method distribution
    expect(report.requestSummary.methodDistribution.GET).toBe(2);
    expect(report.requestSummary.methodDistribution.POST).toBe(1);

    // Check status distribution (grouped by status class)
    expect(report.requestSummary.statusDistribution['2xx']).toBe(3);

    await apiContext.dispose();
  });

  test('should identify extra endpoints not in spec', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    // Add requests including some not in the spec
    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      },
      {
        method: 'GET',
        url: 'https://api.test.com/comments', // Not in spec
        timestamp: Date.now(),
        status: 200,
        duration: 110
      },
      {
        method: 'DELETE',
        url: 'https://api.test.com/posts/123', // Not in spec (DELETE on /posts/{id})
        timestamp: Date.now(),
        status: 204,
        duration: 90
      }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.totalEndpoints).toBe(6);
    expect(report.coveredEndpoints).toBe(1); // Only GET /users matches
    expect(report.extraEndpoints).toHaveLength(2); // 2 extra endpoints
    expect(report.extraEndpoints).toContain('GET /comments');
    expect(report.extraEndpoints).toContain('DELETE /posts/123');

    await apiContext.dispose();
  });

  test('should handle duplicate requests correctly', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    // Add duplicate requests
    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      },
      {
        method: 'GET',
        url: 'https://api.test.com/users', // Duplicate
        timestamp: Date.now(),
        status: 200,
        duration: 105
      },
      {
        method: 'GET',
        url: 'https://api.test.com/users', // Another duplicate
        timestamp: Date.now(),
        status: 200,
        duration: 95
      }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.requestSummary.totalRequests).toBe(3);
    expect(report.requestSummary.uniqueEndpoints).toBe(1);
    expect(report.coveredEndpoints).toBe(1); // Only 1 unique endpoint covered
    expect(report.requestSummary.methodDistribution.GET).toBe(3);

    await apiContext.dispose();
  });

  test('should handle requests with different status codes', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      },
      {
        method: 'GET',
        url: 'https://api.test.com/users/999',
        timestamp: Date.now(),
        status: 404,
        duration: 50
      },
      {
        method: 'POST',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 500,
        duration: 200
      }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.requestSummary.statusDistribution['2xx']).toBe(1);
    expect(report.requestSummary.statusDistribution['4xx']).toBe(1);
    expect(report.requestSummary.statusDistribution['5xx']).toBe(1);

    // All requests should still count as covered endpoints since they match the spec paths
    expect(report.coveredEndpoints).toBe(3); // GET /users, POST /users, and GET /users/{id}

    await apiContext.dispose();
  });

  test('should handle requests without status codes', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        // No status property
        duration: 100
      },
      {
        method: 'POST',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: undefined,
        duration: 150
      }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.requestSummary.totalRequests).toBe(2);
    expect(report.coveredEndpoints).toBe(2);
    // Status distribution should handle undefined status codes gracefully
    expect(Object.keys(report.requestSummary.statusDistribution)).toHaveLength(0);

    await apiContext.dispose();
  });

  test('should identify uncovered endpoints by tags', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    // Only cover user endpoints, leave posts uncovered
    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      },
      {
        method: 'POST',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 201,
        duration: 150
      }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    // Check that posts endpoints are uncovered
    const uncoveredPosts = report.uncoveredEndpoints.filter(ep => 
      ep.tags?.includes('posts')
    );
    expect(uncoveredPosts).toHaveLength(1);
    expect(uncoveredPosts[0].path).toBe('/posts');

    // Check that some admin endpoints are uncovered
    const uncoveredAdmin = report.uncoveredEndpoints.filter(ep => 
      ep.tags?.includes('admin')
    );
    expect(uncoveredAdmin).toHaveLength(1);
    expect(uncoveredAdmin[0].operationId).toBe('deleteUser');

    await apiContext.dispose();
  });

  test('should calculate correct coverage percentage', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    // Cover all endpoints
    const mockRequests = [
      { method: 'GET', url: 'https://api.test.com/users', timestamp: Date.now(), status: 200 },
      { method: 'POST', url: 'https://api.test.com/users', timestamp: Date.now(), status: 201 },
      { method: 'GET', url: 'https://api.test.com/users/123', timestamp: Date.now(), status: 200 },
      { method: 'PUT', url: 'https://api.test.com/users/123', timestamp: Date.now(), status: 200 },
      { method: 'DELETE', url: 'https://api.test.com/users/123', timestamp: Date.now(), status: 204 },
      { method: 'GET', url: 'https://api.test.com/posts', timestamp: Date.now(), status: 200 }
    ];

    (tracker as any).requests = mockRequests;

    const report = analyzer.analyze();

    expect(report.totalEndpoints).toBe(6);
    expect(report.coveredEndpoints).toBe(6);
    expect(report.coveragePercentage).toBe(100);
    expect(report.uncoveredEndpoints).toHaveLength(0);

    await apiContext.dispose();
  });

  test('should handle empty specs gracefully', async () => {
    const apiContext = await request.newContext();
    const tracker = new RequestTracker(apiContext);
    
    const emptySpec = {
      openapi: '3.0.0',
      info: { title: 'Empty API', version: '1.0.0' }
      // No paths
    };
    
    const parser = new OpenAPIParser(emptySpec);
    const analyzer = new CoverageAnalyzer(tracker, parser);

    const report = analyzer.analyze();

    expect(report.totalEndpoints).toBe(0);
    expect(report.coveredEndpoints).toBe(0);
    expect(report.coveragePercentage).toBe(0);
    expect(report.uncoveredEndpoints).toHaveLength(0);

    await apiContext.dispose();
  });
});
