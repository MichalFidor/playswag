import { test, request } from '@playwright/test';
import { createPlaySwag } from '../src';

test.describe('API Coverage Test', () => {
  test('should track API requests and compare with OpenAPI spec', async () => {
    // Create API request context
    const apiContext = await request.newContext({
      baseURL: 'https://petstore.swagger.io/v2'
    });

    // Create PlaySwag instance
    const playswag = createPlaySwag(apiContext);

    // Load OpenAPI specification
    await playswag.loadSpecFromUrl('https://petstore.swagger.io/v2/swagger.json');

    // Use the wrapped request object instead of apiContext directly
    const response1 = await playswag.request.get('/pet/1');
    console.log('Pet details:', response1);

    const response2 = await playswag.request.post('/pet', {
      data: {
        id: 123,
        name: 'Buddy',
        status: 'available'
      }
    });

    const response3 = await playswag.request.get('/store/inventory');

    // Generate and print coverage report
    playswag.printReport();

    // Get detailed report data
    const report = playswag.generateReport();
    console.log(`Coverage: ${report.coveragePercentage.toFixed(2)}%`);

    // Clean up
    await apiContext.dispose();
  });
});
