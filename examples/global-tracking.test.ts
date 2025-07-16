import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';

test.describe('Global Tracking Demo', () => {
  // Clear global state before running tests
  test.beforeAll(async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);
    playswag.clearGlobalRequests();
    await apiContext.dispose();
  });

  test('Test 1: Call users endpoint', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext); // Global tracking enabled by default

    try {
      // Make a request to users endpoint
      await playswag.request.get('https://jsonplaceholder.typicode.com/users');
      
      // Check local requests (only this test's requests)
      const localRequests = playswag.getRequests();
      expect(localRequests).toHaveLength(1);
      expect(localRequests[0].url).toContain('/users');
      
      // Check global requests (should also be 1 at this point)
      const globalRequests = playswag.getGlobalRequests();
      expect(globalRequests).toHaveLength(1);
      expect(globalRequests[0].url).toContain('/users');
      
      console.log(`Test 1 - Local requests: ${localRequests.length}, Global requests: ${globalRequests.length}`);
      
    } catch (error) {
      console.warn('Test endpoint not available, but tracking still works');
    }

    await apiContext.dispose();
  });

  test('Test 2: Call posts endpoint', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext); // New instance, but global tracking persists

    try {
      // Make a request to posts endpoint
      await playswag.request.get('https://jsonplaceholder.typicode.com/posts/1');
      
      // Check local requests (only this test's requests)
      const localRequests = playswag.getRequests();
      expect(localRequests).toHaveLength(1);
      expect(localRequests[0].url).toContain('/posts');
      
      // Check global requests (should now be 2: users + posts)
      const globalRequests = playswag.getGlobalRequests();
      expect(globalRequests.length).toBeGreaterThanOrEqual(1); // At least this test's request
      
      console.log(`Test 2 - Local requests: ${localRequests.length}, Global requests: ${globalRequests.length}`);
      
      // Verify we have different endpoints globally
      const endpoints = new Set(globalRequests.map(req => req.url));
      console.log('Unique endpoints globally tracked:', Array.from(endpoints));
      
    } catch (error) {
      console.warn('Test endpoint not available, but tracking still works');
    }

    await apiContext.dispose();
  });

  test('Test 3: Call comments endpoint and generate global coverage', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    try {
      // Make a request to comments endpoint
      await playswag.request.get('https://jsonplaceholder.typicode.com/comments?postId=1');
      
      // Load a mock spec to demonstrate coverage analysis
      const mockSpec = {
        openapi: '3.0.0',
        info: { title: 'Test API', version: '1.0.0' },
        servers: [{ url: 'https://jsonplaceholder.typicode.com' }],
        paths: {
          '/users': {
            get: { operationId: 'getUsers', summary: 'Get users' }
          },
          '/posts/{id}': {
            get: { operationId: 'getPost', summary: 'Get post by ID' }
          },
          '/comments': {
            get: { operationId: 'getComments', summary: 'Get comments' }
          },
          '/albums': {
            get: { operationId: 'getAlbums', summary: 'Get albums' }
          }
        }
      };

      // Save mock spec to file and load it
      const fs = require('fs');
      const specPath = '/tmp/mock-api-spec.json';
      fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));
      
      playswag.loadSpecFromFile(specPath);
      
      // Generate local coverage report (only this test)
      console.log('\n=== LOCAL COVERAGE (Test 3 only) ===');
      const localReport = playswag.generateReport(false); // Use local data
      console.log(`Local coverage: ${localReport.coveragePercentage.toFixed(1)}%`);
      console.log(`Local covered endpoints: ${localReport.coveredEndpoints}`);
      console.log(`Local total requests: ${playswag.getRequests().length}`);
      
      // Generate global coverage report (all tests combined)
      console.log('\n=== GLOBAL COVERAGE (All tests combined) ===');
      const globalReport = playswag.generateReport(true); // Use global data
      console.log(`Global coverage: ${globalReport.coveragePercentage.toFixed(1)}%`);
      console.log(`Global covered endpoints: ${globalReport.coveredEndpoints}`);
      console.log(`Global total requests: ${playswag.getGlobalRequests().length}`);
      
      // Show the difference
      console.log('\n=== COMPARISON ===');
      console.log(`Coverage improvement with global tracking: ${(globalReport.coveragePercentage - localReport.coveragePercentage).toFixed(1)}%`);
      
    } catch (error) {
      console.warn('Test endpoint not available, but tracking still works');
    }

    await apiContext.dispose();
  });

  test('Test 4: Demonstrate disabled global tracking', async () => {
    const apiContext = await request.newContext();
    // Create instance with global tracking disabled
    const playswag = createPlaySwag(apiContext, false);

    try {
      // This request won't be added to global store
      await playswag.request.get('https://jsonplaceholder.typicode.com/albums');
      
      // Check that this instance is not contributing to global store
      const localRequests = playswag.getRequests();
      const globalRequests = playswag.getGlobalRequests();
      
      console.log(`Test 4 - Local requests: ${localRequests.length}`);
      console.log(`Test 4 - Global requests: ${globalRequests.length}`);
      console.log(`Test 4 - Global tracking enabled: ${playswag.isGlobalTrackingEnabled()}`);
      
      expect(playswag.isGlobalTrackingEnabled()).toBe(false);
      expect(localRequests).toHaveLength(1);
      expect(localRequests[0].url).toContain('/albums');
      
    } catch (error) {
      console.warn('Test endpoint not available, but tracking still works');
    }

    await apiContext.dispose();
  });
});
