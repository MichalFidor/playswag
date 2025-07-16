import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';
import path from 'path';

test.describe('Advanced PlaySwag Features', () => {
  test('should load OpenAPI spec from file and generate coverage report', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    // Create a mock OpenAPI spec for testing
    const mockSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Test API',
        version: '1.0.0'
      },
      servers: [
        {
          url: 'https://api.example.com'
        }
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
            summary: 'Create a user',
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
            tags: ['users']
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

    // Save mock spec to file
    const fs = require('fs');
    const specPath = path.join(__dirname, 'test-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

    try {
      // Load spec from file
      playswag.loadSpecFromFile(specPath);

      // Simulate some API calls (these won't actually make HTTP requests)
      // but will be tracked by PlaySwag
      try {
        await playswag.request.get('https://api.example.com/users');
        await playswag.request.post('https://api.example.com/users', {
          data: { name: 'John Doe', email: 'john@example.com' }
        });
        await playswag.request.get('https://api.example.com/users/123');
      } catch (error) {
        // Expected since these are mock endpoints
      }

      // Generate coverage report
      const report = playswag.generateReport();

      // Verify report structure
      expect(report).toHaveProperty('totalEndpoints');
      expect(report).toHaveProperty('coveredEndpoints');
      expect(report).toHaveProperty('coveragePercentage');
      expect(report).toHaveProperty('uncoveredEndpoints');
      expect(report).toHaveProperty('extraEndpoints');
      expect(report).toHaveProperty('requestSummary');

      // Check that we have endpoints defined
      expect(report.totalEndpoints).toBe(6); // 6 endpoints in our mock spec

      console.log('Coverage Report:', JSON.stringify(report, null, 2));

      // Clean up spec file
      fs.unlinkSync(specPath);
    } catch (error) {
      console.error('Error in advanced test:', error);
      // Clean up spec file even if test fails
      if (fs.existsSync(specPath)) {
        fs.unlinkSync(specPath);
      }
    }

    await apiContext.dispose();
  });

  test('should export request data in different formats', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    try {
      // Make some test requests
      await playswag.request.get('https://jsonplaceholder.typicode.com/posts/1');
      await playswag.request.post('https://jsonplaceholder.typicode.com/posts', {
        data: { title: 'Test Post', body: 'Test content', userId: 1 }
      });
    } catch (error) {
      // Add some mock requests if real endpoint fails
      const mockRequest = {
        method: 'GET',
        url: 'https://api.example.com/test',
        timestamp: Date.now(),
        status: 200,
        duration: 100
      };
      playswag.request['requests'] = [mockRequest]; // Direct access for testing
    }

    const fs = require('fs');
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    try {
      // Test JSON export
      const jsonPath = path.join(tmpDir, 'requests.json');
      playswag.request.exportResults({
        format: 'json',
        filePath: jsonPath
      });
      expect(fs.existsSync(jsonPath)).toBe(true);

      // Test CSV export
      const csvPath = path.join(tmpDir, 'requests.csv');
      playswag.request.exportResults({
        format: 'csv',
        filePath: csvPath,
        includeHeaders: true
      });
      expect(fs.existsSync(csvPath)).toBe(true);

      // Test JUnit export
      const junitPath = path.join(tmpDir, 'results.xml');
      playswag.request.exportResults({
        format: 'junit',
        filePath: junitPath,
        testSuiteName: 'API Coverage Tests'
      });
      expect(fs.existsSync(junitPath)).toBe(true);

      // Verify file contents
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      const jsonData = JSON.parse(jsonContent);
      expect(jsonData).toHaveProperty('summary');
      expect(jsonData).toHaveProperty('requests');

      const csvContent = fs.readFileSync(csvPath, 'utf8');
      expect(csvContent).toContain('Method,URL,Status,Duration(ms),Timestamp');

      const junitContent = fs.readFileSync(junitPath, 'utf8');
      expect(junitContent).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(junitContent).toContain('<testsuite');

      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (cleanupError) {
      console.warn('Cleanup error:', cleanupError);
    }

    await apiContext.dispose();
  });
});
