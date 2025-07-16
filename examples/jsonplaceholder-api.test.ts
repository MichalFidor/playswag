import { test, request, expect } from '@playwright/test';
import { createPlaySwag } from '../src';

test.describe('JSONPlaceholder API Testing', () => {
  test('should test CRUD operations and track coverage', async () => {
    const apiContext = await request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });

    const playswag = createPlaySwag(apiContext);

    try {
      // Create a mock OpenAPI spec for JSONPlaceholder
      const mockSpec = {
        openapi: '3.0.0',
        info: {
          title: 'JSONPlaceholder API',
          version: '1.0.0',
          description: 'Fake REST API for testing and prototyping'
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
            patch: {
              operationId: 'patchPost',
              summary: 'Partially update post',
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
          },
          '/users/{id}': {
            get: {
              operationId: 'getUser',
              summary: 'Get user by ID',
              tags: ['users']
            }
          },
          '/comments': {
            get: {
              operationId: 'getComments',
              summary: 'Get all comments',
              tags: ['comments']
            }
          }
        }
      };

      // Save and load the spec
      const fs = require('fs');
      const path = require('path');
      const specPath = path.join(__dirname, 'jsonplaceholder-spec.json');
      fs.writeFileSync(specPath, JSON.stringify(mockSpec, null, 2));
      
      playswag.loadSpecFromFile(specPath);

      console.log('Testing JSONPlaceholder API...');

      // Test GET all posts
      const postsResponse = await playswag.request.get('/posts');
      expect(postsResponse.status()).toBe(200);
      const posts = await postsResponse.json();
      expect(Array.isArray(posts)).toBe(true);
      console.log(`✓ Retrieved ${posts.length} posts`);

      // Test GET specific post
      const postResponse = await playswag.request.get('/posts/1');
      expect(postResponse.status()).toBe(200);
      const post = await postResponse.json();
      expect(post).toHaveProperty('id');
      expect(post).toHaveProperty('title');
      console.log(`✓ Retrieved post: "${post.title}"`);

      // Test POST (create new post)
      const newPostData = {
        title: 'Test Post from PlaySwag',
        body: 'This is a test post created during API coverage testing',
        userId: 1
      };
      
      const createResponse = await playswag.request.post('/posts', {
        data: newPostData
      });
      expect(createResponse.status()).toBe(201);
      const createdPost = await createResponse.json();
      expect(createdPost).toHaveProperty('id');
      console.log(`✓ Created post with ID: ${createdPost.id}`);

      // Test PUT (update post)
      const updatedPostData = {
        id: 1,
        title: 'Updated Post Title',
        body: 'Updated post content',
        userId: 1
      };
      
      const updateResponse = await playswag.request.put('/posts/1', {
        data: updatedPostData
      });
      expect(updateResponse.status()).toBe(200);
      console.log('✓ Post updated successfully');

      // Test PATCH (partial update)
      const patchResponse = await playswag.request.patch('/posts/1', {
        data: { title: 'Patched Title' }
      });
      expect(patchResponse.status()).toBe(200);
      console.log('✓ Post patched successfully');

      // Test DELETE
      const deleteResponse = await playswag.request.delete('/posts/1');
      expect(deleteResponse.status()).toBe(200);
      console.log('✓ Post deleted successfully');

      // Test GET users
      const usersResponse = await playswag.request.get('/users');
      expect(usersResponse.status()).toBe(200);
      const users = await usersResponse.json();
      console.log(`✓ Retrieved ${users.length} users`);

      // Test GET specific user
      const userResponse = await playswag.request.get('/users/1');
      expect(userResponse.status()).toBe(200);
      const user = await userResponse.json();
      console.log(`✓ Retrieved user: ${user.name}`);

      // Test GET comments
      const commentsResponse = await playswag.request.get('/comments');
      expect(commentsResponse.status()).toBe(200);
      const comments = await commentsResponse.json();
      console.log(`✓ Retrieved ${comments.length} comments`);

      // Generate coverage report
      const report = playswag.generateReport();
      
      console.log('\n=== JSONPlaceholder Coverage Report ===');
      console.log(`Total endpoints: ${report.totalEndpoints}`);
      console.log(`Covered endpoints: ${report.coveredEndpoints}`);
      console.log(`Coverage: ${report.coveragePercentage.toFixed(2)}%`);
      console.log(`Total requests: ${report.requestSummary.totalRequests}`);

      // Detailed report
      playswag.printReport();

      // Assertions
      expect(report.totalEndpoints).toBe(9); // Based on our mock spec
      expect(report.requestSummary.totalRequests).toBe(9); // We made 9 requests
      expect(report.coveragePercentage).toBeGreaterThan(70); // Should have good coverage

      // Clean up
      fs.unlinkSync(specPath);

    } catch (error) {
      console.error('JSONPlaceholder test failed:', error);
      throw error;
    }

    await apiContext.dispose();
  });

  test('should handle query parameters and filters', async () => {
    const apiContext = await request.newContext({
      baseURL: 'https://jsonplaceholder.typicode.com'
    });

    const playswag = createPlaySwag(apiContext);

    try {
      // Test various query parameters
      console.log('Testing query parameters...');

      // Filter posts by user
      const userPostsResponse = await playswag.request.get('/posts', {
        params: { userId: 1 }
      });
      expect(userPostsResponse.status()).toBe(200);
      const userPosts = await userPostsResponse.json();
      console.log(`✓ Found ${userPosts.length} posts for user 1`);

      // Filter comments by post
      const postCommentsResponse = await playswag.request.get('/comments', {
        params: { postId: 1 }
      });
      expect(postCommentsResponse.status()).toBe(200);
      const postComments = await postCommentsResponse.json();
      console.log(`✓ Found ${postComments.length} comments for post 1`);

      // Test nested resource access
      const post1CommentsResponse = await playswag.request.get('/posts/1/comments');
      expect(post1CommentsResponse.status()).toBe(200);
      const nestedComments = await post1CommentsResponse.json();
      console.log(`✓ Found ${nestedComments.length} comments via nested route`);

      // Check request tracking
      const requests = playswag.getRequests();
      expect(requests.length).toBe(3);
      
      // Verify query parameters are tracked
      const requestWithParams = requests.find(req => req.params && req.params.userId);
      expect(requestWithParams).toBeDefined();
      expect(requestWithParams?.params?.userId).toBe(1);

      console.log('Request details:');
      requests.forEach((req, index) => {
        console.log(`  ${index + 1}. ${req.method} ${req.url} - Status: ${req.status}`);
        if (req.params) {
          console.log(`     Params: ${JSON.stringify(req.params)}`);
        }
      });

    } catch (error) {
      console.error('Query parameters test failed:', error);
    }

    await apiContext.dispose();
  });
});
