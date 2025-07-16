import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Enhanced Logging and JSON Export', () => {
  test('should demonstrate enhanced logging and comprehensive JSON export', async () => {
    const apiContext = await request.newContext();
    const playswag = createPlaySwag(apiContext);

    // Create a mock API spec for testing
    const mockSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Enhanced Demo API',
        version: '1.0.0',
        description: 'API for demonstrating enhanced logging features'
      },
      servers: [
        { url: 'https://api.demo.com' }
      ],
      paths: {
        '/users': {
          get: {
            operationId: 'listUsers',
            summary: 'Get all users',
            tags: ['users', 'public']
          },
          post: {
            operationId: 'createUser',
            summary: 'Create a new user',
            tags: ['users', 'admin']
          }
        },
        '/users/{id}': {
          get: {
            operationId: 'getUser',
            summary: 'Get user by ID',
            tags: ['users', 'public']
          },
          put: {
            operationId: 'updateUser',
            summary: 'Update user',
            tags: ['users', 'admin']
          },
          delete: {
            operationId: 'deleteUser',
            summary: 'Delete user',
            tags: ['users', 'admin']
          }
        },
        '/posts': {
          get: {
            operationId: 'listPosts',
            summary: 'Get all posts',
            tags: ['posts', 'public']
          },
          post: {
            operationId: 'createPost',
            summary: 'Create a new post',
            tags: ['posts', 'user']
          }
        },
        '/admin/stats': {
          get: {
            operationId: 'getStats',
            summary: 'Get system statistics',
            tags: ['admin', 'system']
          }
        }
      }
    };

    // Save spec to file and load it
    const specPath = path.join(__dirname, 'enhanced-demo-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));

    try {
      playswag.loadSpecFromFile(specPath);

      console.log('🚀 Starting enhanced logging demonstration...');

      // Simulate various API calls with different patterns
      try {
        // Successful calls
        await playswag.request.get('https://api.demo.com/users');
        await playswag.request.get('https://api.demo.com/users');  // Duplicate to show usage count
        await playswag.request.get('https://api.demo.com/users/123');
        await playswag.request.post('https://api.demo.com/users', {
          data: { name: 'John Doe', email: 'john@example.com' }
        });
        await playswag.request.get('https://api.demo.com/posts');
        
        // Calls that might fail (for error analysis)
        await playswag.request.get('https://api.demo.com/users/999');  // Might be 404
        await playswag.request.put('https://api.demo.com/users/123', {
          data: { name: 'Updated User' }
        });

        // Extra endpoint not in spec
        await playswag.request.get('https://api.demo.com/health');  // Not in spec
      } catch (error) {
        // Expected for mock endpoints
        console.log('Note: Some requests failed as expected (mock endpoints)');
      }

      // Add some mock request data for demonstration
      const mockRequests = [
        {
          method: 'GET',
          url: 'https://api.demo.com/users',
          timestamp: Date.now() - 5000,
          status: 200,
          duration: 150
        },
        {
          method: 'GET',
          url: 'https://api.demo.com/users',
          timestamp: Date.now() - 4000,
          status: 200,
          duration: 120
        },
        {
          method: 'GET',
          url: 'https://api.demo.com/users/123',
          timestamp: Date.now() - 3000,
          status: 200,
          duration: 95
        },
        {
          method: 'POST',
          url: 'https://api.demo.com/users',
          timestamp: Date.now() - 2000,
          status: 201,
          duration: 250
        },
        {
          method: 'GET',
          url: 'https://api.demo.com/posts',
          timestamp: Date.now() - 1000,
          status: 200,
          duration: 180
        },
        {
          method: 'GET',
          url: 'https://api.demo.com/users/999',
          timestamp: Date.now() - 500,
          status: 404,
          duration: 50
        },
        {
          method: 'PUT',
          url: 'https://api.demo.com/users/123',
          timestamp: Date.now() - 200,
          status: 200,
          duration: 200
        },
        {
          method: 'GET',
          url: 'https://api.demo.com/health',
          timestamp: Date.now() - 100,
          status: 200,
          duration: 30
        }
      ];

      // Add mock data to tracker for demonstration
      const tracker = playswag.request;
      mockRequests.forEach(req => {
        (tracker as any).requests.push(req);
      });

      console.log('\n📊 DEMONSTRATION: Enhanced Logging and JSON Export');
      console.log('='.repeat(60));

      // 1. Show the basic enhanced report
      console.log('\n1️⃣ Enhanced Coverage Report:');
      playswag.printReport();

      // 2. Show the comprehensive summary with all features
      console.log('\n2️⃣ Comprehensive Summary with Insights:');
      const exportDir = path.join(__dirname, 'reports');
      if (!fs.existsSync(exportDir)) {
        fs.mkdirSync(exportDir, { recursive: true });
      }

      playswag.printEnhancedSummary({
        exportJson: path.join(exportDir, 'basic-summary.json'),
        exportComprehensive: path.join(exportDir, 'comprehensive-summary.json'),
        showRecommendations: true,
        showPerformanceMetrics: true
      });

      // 3. Demonstrate different export formats
      console.log('\n3️⃣ Multiple Export Formats:');
      
      // CSV export
      playswag.request.exportResults({
        format: 'csv',
        filePath: path.join(exportDir, 'requests.csv'),
        includeHeaders: true
      });

      // JUnit XML export
      playswag.request.exportResults({
        format: 'junit',
        filePath: path.join(exportDir, 'test-results.xml'),
        testSuiteName: 'Enhanced Demo API Tests'
      });

      console.log('📄 All reports exported to:', exportDir);

      // 4. Show generated files
      console.log('\n4️⃣ Generated Files:');
      const files = fs.readdirSync(exportDir);
      files.forEach(file => {
        const filePath = path.join(exportDir, file);
        const stats = fs.statSync(filePath);
        console.log(`   📄 ${file} (${Math.round(stats.size / 1024)}KB)`);
      });

      // 5. Show a preview of the comprehensive JSON
      console.log('\n5️⃣ Comprehensive JSON Preview:');
      const comprehensiveData = JSON.parse(fs.readFileSync(path.join(exportDir, 'comprehensive-summary.json'), 'utf8'));
      console.log('   Metadata:', JSON.stringify(comprehensiveData.metadata, null, 2));
      console.log('   Coverage Percentage:', comprehensiveData.coverage.coveragePercentage + '%');
      console.log('   Total Endpoints:', comprehensiveData.endpointUsage.length);
      console.log('   Performance Average:', comprehensiveData.performanceMetrics?.averageResponseTime + 'ms');

      // Assertions
      const report = playswag.generateReport();
      expect(report.totalEndpoints).toBe(8);  // 8 endpoints in our spec
      expect(report.requestSummary.totalRequests).toBe(9);  // 9 mock requests (8 + 1 duplicate GET)
      expect(report.extraEndpoints.length).toBe(1);  // /health endpoint not in spec

      // Verify files were created
      expect(fs.existsSync(path.join(exportDir, 'basic-summary.json'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'comprehensive-summary.json'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'requests.csv'))).toBe(true);
      expect(fs.existsSync(path.join(exportDir, 'test-results.xml'))).toBe(true);

      console.log('\n✅ Enhanced logging and JSON export demonstration completed successfully!');

      // Clean up
      fs.unlinkSync(specPath);
      // Keep the reports directory for inspection

    } catch (error) {
      console.error('Demo failed:', error);
      if (fs.existsSync(specPath)) {
        fs.unlinkSync(specPath);
      }
      throw error;
    }

    await apiContext.dispose();
  });
});
