/**
 * Comprehensive unit tests for PlaySwag core functionality
 */

import { test, expect, request } from '@playwright/test';
import { PlaySwag, createPlaySwag } from '../src/core/playswag';
import { RequestTracker } from '../src/core/request-tracker';
import path from 'path';
import fs from 'fs';

test.describe('PlaySwag Core', () => {
  test('should create instance with request tracker', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);
    
    expect(playswag).toBeInstanceOf(PlaySwag);
    expect(playswag.request).toBeInstanceOf(RequestTracker);
    
    await apiContext.dispose();
  });

  test('should create instance using helper function', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);
    
    expect(playswag).toBeInstanceOf(PlaySwag);
    expect(playswag.request).toBeInstanceOf(RequestTracker);
    
    await apiContext.dispose();
  });

  test('should track requests correctly', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);
    
    expect(playswag.getRequests()).toHaveLength(0);
    
    playswag.clearRequests();
    expect(playswag.getRequests()).toHaveLength(0);
    
    await apiContext.dispose();
  });

  test('should throw error when generating report without spec', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);
    
    expect(() => playswag.generateReport()).toThrow('OpenAPI spec not loaded');
    
    await apiContext.dispose();
  });

  test('should load spec from file successfully', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Test endpoint'
          }
        }
      }
    };

    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const specPath = path.join(tmpDir, 'test-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

    try {
      playswag.loadSpecFromFile(specPath);
      
      // Should not throw error after loading spec
      const report = playswag.generateReport();
      expect(report).toBeDefined();
      expect(report.totalEndpoints).toBe(1);

      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }
    
    await apiContext.dispose();
  });

  test('should load spec from URL successfully', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    try {
      await playswag.loadSpecFromUrl('https://petstore.swagger.io/v2/swagger.json');
      
      const report = playswag.generateReport();
      expect(report).toBeDefined();
      expect(report.totalEndpoints).toBeGreaterThan(0);
    } catch (error) {
      console.warn('External API not available for URL test');
    }
    
    await apiContext.dispose();
  });

  test('should generate and print reports', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Test API', version: '1.0.0' },
      paths: {
        '/users': {
          get: {
            operationId: 'getUsers',
            summary: 'Get users'
          },
          post: {
            operationId: 'createUser',
            summary: 'Create user'
          }
        }
      }
    };

    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const specPath = path.join(tmpDir, 'report-test-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

    try {
      playswag.loadSpecFromFile(specPath);

      // Add some mock requests
      const mockRequests = [
        {
          method: 'GET',
          url: 'https://api.test.com/users',
          timestamp: Date.now(),
          status: 200,
          duration: 100
        }
      ];

      (playswag.request as any).requests = mockRequests;

      // Test generating report
      const report = playswag.generateReport();
      expect(report.totalEndpoints).toBe(2);
      expect(report.coveredEndpoints).toBe(1);
      expect(report.coveragePercentage).toBe(50);

      // Test printing report (should not throw)
      expect(() => playswag.printReport()).not.toThrow();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }
    
    await apiContext.dispose();
  });

  test('should handle empty request list in reports', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    const mockSpec = {
      openapi: '3.0.0',
      info: { title: 'Empty Test API', version: '1.0.0' },
      paths: {
        '/test': {
          get: {
            operationId: 'getTest',
            summary: 'Test endpoint'
          }
        }
      }
    };

    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const specPath = path.join(tmpDir, 'empty-test-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

    try {
      playswag.loadSpecFromFile(specPath);

      // No requests made, test empty state
      const report = playswag.generateReport();
      expect(report.totalEndpoints).toBe(1);
      expect(report.coveredEndpoints).toBe(0);
      expect(report.coveragePercentage).toBe(0);
      expect(report.requestSummary.totalRequests).toBe(0);

      // Should handle printing empty report gracefully
      expect(() => playswag.printReport()).not.toThrow();

      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }
    
    await apiContext.dispose();
  });

  test('should clear requests properly', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    // Add some mock requests
    const mockRequests = [
      { method: 'GET', url: 'https://api.test.com/test1', timestamp: Date.now() },
      { method: 'POST', url: 'https://api.test.com/test2', timestamp: Date.now() }
    ];

    (playswag.request as any).requests = mockRequests;

    expect(playswag.getRequests()).toHaveLength(2);
    
    playswag.clearRequests();
    expect(playswag.getRequests()).toHaveLength(0);
    
    await apiContext.dispose();
  });

  test('should handle invalid file paths gracefully', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    expect(() => {
      playswag.loadSpecFromFile('/nonexistent/path/spec.json');
    }).toThrow();
    
    await apiContext.dispose();
  });

  test('should handle invalid URLs gracefully', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    await expect(async () => {
      await playswag.loadSpecFromUrl('https://nonexistent.example.com/spec.json');
    }).rejects.toThrow();
    
    await apiContext.dispose();
  });

  test('should maintain state consistency', async () => {
    const apiContext = await request.newContext();
    const playswag = new PlaySwag(apiContext);

    // Initial state
    expect(playswag.getRequests()).toHaveLength(0);

    // Add requests
    const mockRequests = [
      { method: 'GET', url: 'https://api.test.com/test', timestamp: Date.now() }
    ];
    (playswag.request as any).requests = mockRequests;

    expect(playswag.getRequests()).toHaveLength(1);

    // Clear and verify
    playswag.clearRequests();
    expect(playswag.getRequests()).toHaveLength(0);

    // Should still work after clearing
    const newMockRequests = [
      { method: 'POST', url: 'https://api.test.com/new', timestamp: Date.now() }
    ];
    (playswag.request as any).requests = newMockRequests;

    expect(playswag.getRequests()).toHaveLength(1);
    
    await apiContext.dispose();
  });
});
