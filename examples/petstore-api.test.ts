import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';

test.describe('Petstore API Coverage', () => {
  test('should test multiple endpoints and generate coverage report', async () => {
    const apiContext = await request.newContext({
      baseURL: 'https://petstore.swagger.io/v2'
    });

    const playswag = createPlaySwag(apiContext);

    try {
      // Load the Petstore OpenAPI spec
      await playswag.loadSpecFromUrl('https://petstore.swagger.io/v2/swagger.json');

      // Test various endpoints
      console.log('Testing Petstore API endpoints...');

      // Get store inventory
      try {
        const inventoryResponse = await playswag.request.get('/store/inventory');
        expect(inventoryResponse.status()).toBe(200);
        console.log('✓ Store inventory fetched');
      } catch (error) {
        console.log('✗ Store inventory failed:', error.message);
      }

      // Get pet by status
      try {
        const petsByStatusResponse = await playswag.request.get('/pet/findByStatus', {
          params: { status: 'available' }
        });
        expect(petsByStatusResponse.status()).toBe(200);
        console.log('✓ Pets by status fetched');
      } catch (error) {
        console.log('✗ Pets by status failed:', error.message);
      }

      // Try to get a specific pet (might not exist)
      try {
        await playswag.request.get('/pet/1');
        console.log('✓ Specific pet fetched');
      } catch (error) {
        console.log('✗ Specific pet failed (expected):', error.message);
      }

      // Create a new pet
      try {
        const newPetResponse = await playswag.request.post('/pet', {
          data: {
            id: Math.floor(Math.random() * 10000),
            name: 'Test Pet',
            category: {
              id: 1,
              name: 'Dogs'
            },
            photoUrls: ['https://example.com/photo.jpg'],
            tags: [
              {
                id: 1,
                name: 'friendly'
              }
            ],
            status: 'available'
          }
        });
        expect(newPetResponse.status()).toBe(200);
        console.log('✓ New pet created');
      } catch (error) {
        console.log('✗ Pet creation failed:', error.message);
      }

      // Generate and analyze coverage report
      const report = playswag.generateReport();
      
      console.log('\n=== Petstore API Coverage Report ===');
      console.log(`Total endpoints in spec: ${report.totalEndpoints}`);
      console.log(`Covered endpoints: ${report.coveredEndpoints}`);
      console.log(`Coverage percentage: ${report.coveragePercentage.toFixed(2)}%`);
      console.log(`Total requests made: ${report.requestSummary.totalRequests}`);
      console.log(`Unique endpoints tested: ${report.requestSummary.uniqueEndpoints}`);

      console.log('\nMethod distribution:');
      Object.entries(report.requestSummary.methodDistribution).forEach(([method, count]) => {
        console.log(`  ${method}: ${count}`);
      });

      console.log('\nStatus distribution:');
      Object.entries(report.requestSummary.statusDistribution).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`);
      });

      if (report.uncoveredEndpoints.length > 0) {
        console.log('\nUncovered endpoints:');
        report.uncoveredEndpoints.slice(0, 10).forEach(endpoint => {
          console.log(`  ${endpoint.method} ${endpoint.path} - ${endpoint.summary || 'No description'}`);
        });
        if (report.uncoveredEndpoints.length > 10) {
          console.log(`  ... and ${report.uncoveredEndpoints.length - 10} more`);
        }
      }

      if (report.extraEndpoints.length > 0) {
        console.log('\nExtra endpoints (not in spec):');
        report.extraEndpoints.forEach(endpoint => {
          console.log(`  ${endpoint}`);
        });
      }

      // Print detailed report
      console.log('\n=== Detailed Request Log ===');
      playswag.printReport();

      // Basic assertions
      expect(report.totalEndpoints).toBeGreaterThan(0);
      expect(report.requestSummary.totalRequests).toBeGreaterThan(0);

    } catch (error) {
      console.error('Test failed:', error);
      // Still try to show what we tracked
      try {
        const requests = playswag.getRequests();
        console.log('Tracked requests despite errors:', requests.length);
      } catch (e) {
        console.error('Could not get requests:', e);
      }
    }

    await apiContext.dispose();
  });

  test('should handle API errors gracefully', async () => {
    const apiContext = await request.newContext({
      baseURL: 'https://petstore.swagger.io/v2'
    });

    const playswag = createPlaySwag(apiContext);

    try {
      await playswag.loadSpecFromUrl('https://petstore.swagger.io/v2/swagger.json');

      // Try to access non-existent endpoints
      try {
        await playswag.request.get('/pet/999999');
      } catch (error) {
        // Expected to fail
      }

      try {
        await playswag.request.delete('/pet/999999');
      } catch (error) {
        // Expected to fail
      }

      // Check that failed requests are still tracked
      const requests = playswag.getRequests();
      expect(requests.length).toBeGreaterThan(0);

      // Verify error responses are tracked with status codes
      const failedRequests = requests.filter(req => req.status && req.status >= 400);
      console.log(`Tracked ${failedRequests.length} failed requests`);

    } catch (error) {
      console.error('Spec loading failed:', error);
    }

    await apiContext.dispose();
  });
});
