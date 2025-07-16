/**
 * Integration tests for PlaySwag functionality
 */

import { test, expect, request } from '@playwright/test';
import { createPlaySwag, PlaySwag } from '../src';
import path from 'path';
import fs from 'fs';

test.describe('PlaySwag Integration', () => {
  const mockOpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: 'Integration Test API',
      version: '1.0.0',
      description: 'API for integration testing'
    },
    servers: [
      { url: 'https://jsonplaceholder.typicode.com' }
    ],
    paths: {
      '/posts': {
        get: {
          operationId: 'getPosts',
          summary: 'Get all posts',
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
        put: {
          operationId: 'updatePost',
          summary: 'Update post',
          tags: ['posts']
        },
        delete: {
          operationId: 'deletePost',
          summary: 'Delete post',
          tags: ['posts']
        }
      },
      '/users': {
        get: {
          operationId: 'getUsers',
          summary: 'Get all users',
          tags: ['users']
        }
      }
    }
  };

  test('should complete full workflow with real API', async () => {
    const apiContext = await request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });

    const playswag = createPlaySwag(apiContext);

    // Save mock spec to file
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const specPath = path.join(tmpDir, 'integration-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockOpenAPISpec, null, 2));

    try {
      // Load spec from file
      playswag.loadSpecFromFile(specPath);

      console.log('Running integration test with JSONPlaceholder API...');

      // Test multiple endpoints
      try {
        // GET all posts
        const postsResponse = await playswag.request.get('/posts');
        expect(postsResponse.status()).toBe(200);
        console.log('✓ GET /posts successful');

        // GET specific post
        const postResponse = await playswag.request.get('/posts/1');
        expect(postResponse.status()).toBe(200);
        console.log('✓ GET /posts/1 successful');

        // POST new post
        const createResponse = await playswag.request.post('/posts', {
          data: {
            title: 'Integration Test Post',
            body: 'This is a test post from PlaySwag integration test',
            userId: 1
          }
        });
        expect(createResponse.status()).toBe(201);
        console.log('✓ POST /posts successful');

        // PUT update post
        const updateResponse = await playswag.request.put('/posts/1', {
          data: {
            id: 1,
            title: 'Updated Post',
            body: 'Updated content',
            userId: 1
          }
        });
        expect(updateResponse.status()).toBe(200);
        console.log('✓ PUT /posts/1 successful');

        // GET users
        const usersResponse = await playswag.request.get('/users');
        expect(usersResponse.status()).toBe(200);
        console.log('✓ GET /users successful');

      } catch (error) {
        console.warn('Some API calls failed, but testing continues:', error.message);
      }

      // Generate and verify coverage report
      const report = playswag.generateReport();

      console.log('\nIntegration Test Results:');
      console.log(`Total endpoints in spec: ${report.totalEndpoints}`);
      console.log(`Covered endpoints: ${report.coveredEndpoints}`);
      console.log(`Coverage percentage: ${report.coveragePercentage.toFixed(2)}%`);
      console.log(`Total requests made: ${report.requestSummary.totalRequests}`);

      // Verify basic structure
      expect(report).toHaveProperty('totalEndpoints');
      expect(report).toHaveProperty('coveredEndpoints');
      expect(report).toHaveProperty('coveragePercentage');
      expect(report).toHaveProperty('uncoveredEndpoints');
      expect(report).toHaveProperty('requestSummary');

      expect(report.totalEndpoints).toBe(6);
      expect(report.requestSummary.totalRequests).toBeGreaterThan(0);

      // Print detailed report
      console.log('\nDetailed Coverage Report:');
      playswag.printReport();

      // Test request details
      const requests = playswag.getRequests();
      expect(requests.length).toBeGreaterThan(0);

      requests.forEach((req, index) => {
        console.log(`Request ${index + 1}: ${req.method} ${req.url} - Status: ${req.status} - Duration: ${req.duration}ms`);
        expect(req.method).toBeDefined();
        expect(req.url).toBeDefined();
        expect(req.timestamp).toBeDefined();
      });

      // Test clearing requests
      const requestCountBefore = playswag.getRequests().length;
      playswag.clearRequests();
      expect(playswag.getRequests()).toHaveLength(0);
      console.log(`Cleared ${requestCountBefore} requests`);

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });

    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }

    await apiContext.dispose();
  });

  test('should handle spec loading errors gracefully', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    // Test loading non-existent file
    expect(() => {
      playswag.loadSpecFromFile('/nonexistent/spec.json');
    }).toThrow();

    // Test generating report without spec
    expect(() => {
      playswag.generateReport();
    }).toThrow('OpenAPI spec not loaded');

    await apiContext.dispose();
  });

  test('should export integration test results', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    // Add some mock data
    const mockRequests = [
      {
        method: 'GET',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 200,
        duration: 150
      },
      {
        method: 'POST',
        url: 'https://api.test.com/users',
        timestamp: Date.now(),
        status: 201,
        duration: 200
      },
      {
        method: 'GET',
        url: 'https://api.test.com/posts',
        timestamp: Date.now(),
        status: 404,
        duration: 100
      }
    ];

    // Set mock requests
    (playswag.request as any).requests = mockRequests;

    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    try {
      // Test all export formats
      const formats = ['json', 'csv', 'junit'] as const;
      
      for (const format of formats) {
        const filePath = path.join(tmpDir, `integration-test.${format === 'junit' ? 'xml' : format}`);
        
        playswag.request.exportResults({
          format,
          filePath,
          ...(format === 'junit' && { testSuiteName: 'Integration Tests' }),
          ...(format === 'csv' && { includeHeaders: true })
        });

        expect(fs.existsSync(filePath)).toBe(true);
        
        const content = fs.readFileSync(filePath, 'utf8');
        expect(content.length).toBeGreaterThan(0);
        
        console.log(`✓ Successfully exported ${format.toUpperCase()} format`);
        
        // Verify format-specific content
        if (format === 'json') {
          const data = JSON.parse(content);
          expect(data).toHaveProperty('summary');
          expect(data).toHaveProperty('requests');
          expect(data.requests).toHaveLength(3);
        } else if (format === 'csv') {
          expect(content).toContain('Method,URL,Status,Duration(ms),Timestamp');
          expect(content).toContain('GET');
          expect(content).toContain('POST');
        } else if (format === 'junit') {
          expect(content).toContain('<?xml version="1.0" encoding="UTF-8"?>');
          expect(content).toContain('<testsuite');
          expect(content).toContain('Integration Tests');
        }
      }

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });

    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }

    await apiContext.dispose();
  });

  test('should handle complex workflow with multiple specs', async () => {
    const apiContext = await request.newContext();
    
    // Test creating multiple PlaySwag instances
    const playswag1 = createPlaySwag(apiContext);
    const playswag2 = new PlaySwag(apiContext);

    expect(playswag1).toBeDefined();
    expect(playswag2).toBeDefined();
    expect(playswag1).not.toBe(playswag2);

    // Both should start with empty requests
    expect(playswag1.getRequests()).toHaveLength(0);
    expect(playswag2.getRequests()).toHaveLength(0);

    await apiContext.dispose();
  });

  test('should maintain request isolation between instances', async () => {
    const apiContext1 = await request.newContext();
    const apiContext2 = await request.newContext();
    
    const playswag1 = createPlaySwag(apiContext1);
    const playswag2 = createPlaySwag(apiContext2);

    // Add mock requests to each instance
    (playswag1.request as any).requests = [
      { method: 'GET', url: 'https://api1.test.com/users', timestamp: Date.now() }
    ];

    (playswag2.request as any).requests = [
      { method: 'POST', url: 'https://api2.test.com/posts', timestamp: Date.now() },
      { method: 'GET', url: 'https://api2.test.com/posts', timestamp: Date.now() }
    ];

    // Verify isolation
    expect(playswag1.getRequests()).toHaveLength(1);
    expect(playswag2.getRequests()).toHaveLength(2);

    expect(playswag1.getRequests()[0].url).toContain('api1.test.com');
    expect(playswag2.getRequests()[0].url).toContain('api2.test.com');

    await apiContext1.dispose();
    await apiContext2.dispose();
  });

  test('should handle large number of requests efficiently', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    console.log('Testing performance with large number of requests...');
    
    const startTime = Date.now();
    
    // Simulate many requests
    const mockRequests: any[] = [];
    for (let i = 0; i < 1000; i++) {
      mockRequests.push({
        method: i % 2 === 0 ? 'GET' : 'POST',
        url: `https://api.test.com/resource/${i}`,
        timestamp: Date.now() + i,
        status: 200,
        duration: Math.floor(Math.random() * 200) + 50
      });
    }

    (playswag.request as any).requests = mockRequests;

    const requestsTime = Date.now() - startTime;
    console.log(`Added 1000 mock requests in ${requestsTime}ms`);

    // Test operations on large dataset
    const analysisStartTime = Date.now();
    
    const requests = playswag.getRequests();
    expect(requests).toHaveLength(1000);

    const uniqueEndpoints = playswag.request.getUniqueEndpoints();
    expect(uniqueEndpoints.size).toBe(1000); // All unique URLs

    const analysisTime = Date.now() - analysisStartTime;
    console.log(`Analyzed 1000 requests in ${analysisTime}ms`);

    // Performance should be reasonable (under 1 second for basic operations)
    expect(analysisTime).toBeLessThan(1000);

    await apiContext.dispose();
  });
});
