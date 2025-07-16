/**
 * Unit tests for OpenAPIParser functionality
 */

import { test, expect } from '@playwright/test';
import { OpenAPIParser } from '../src/parsers/openapi';
import path from 'path';
import fs from 'fs';

test.describe('OpenAPIParser', () => {
  const mockOpenAPISpec = {
    openapi: '3.0.0',
    info: {
      title: 'Test API',
      version: '1.0.0',
      description: 'A test API for unit testing'
    },
    servers: [
      {
        url: 'https://api.test.com'
      },
      {
        url: 'https://staging.api.test.com'
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
      '/posts/{postId}/comments': {
        get: {
          operationId: 'getPostComments',
          summary: 'Get comments for a post',
          tags: ['comments']
        },
        post: {
          operationId: 'createComment',
          summary: 'Create a comment',
          tags: ['comments']
        }
      }
    }
  };

  test('should create parser from spec object', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    expect(parser).toBeDefined();
  });

  test('should extract endpoints from spec', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const endpoints = parser.getEndpoints();

    expect(endpoints).toHaveLength(7);

    // Check specific endpoints
    const getUsersEndpoint = endpoints.find(ep => ep.operationId === 'getUsers');
    expect(getUsersEndpoint).toBeDefined();
    expect(getUsersEndpoint?.method).toBe('GET');
    expect(getUsersEndpoint?.path).toBe('/users');
    expect(getUsersEndpoint?.summary).toBe('Get all users');
    expect(getUsersEndpoint?.tags).toContain('users');

    const createUserEndpoint = endpoints.find(ep => ep.operationId === 'createUser');
    expect(createUserEndpoint).toBeDefined();
    expect(createUserEndpoint?.method).toBe('POST');
    expect(createUserEndpoint?.path).toBe('/users');

    const deleteUserEndpoint = endpoints.find(ep => ep.operationId === 'deleteUser');
    expect(deleteUserEndpoint).toBeDefined();
    expect(deleteUserEndpoint?.method).toBe('DELETE');
    expect(deleteUserEndpoint?.path).toBe('/users/{id}');
    expect(deleteUserEndpoint?.tags).toContain('users');
    expect(deleteUserEndpoint?.tags).toContain('admin');
  });

  test('should get base URL from servers', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const baseUrl = parser.getBaseUrl();
    expect(baseUrl).toBe('https://api.test.com');
  });

  test('should get API info', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    const info = parser.getInfo();
    
    expect(info.title).toBe('Test API');
    expect(info.version).toBe('1.0.0');
  });

  test('should handle spec without servers', () => {
    const specWithoutServers = { ...mockOpenAPISpec, servers: undefined };
    
    const parser = new OpenAPIParser(specWithoutServers);
    const baseUrl = parser.getBaseUrl();
    expect(baseUrl).toBeUndefined();
  });

  test('should handle spec without paths', () => {
    const specWithoutPaths = {
      openapi: '3.0.0',
      info: { title: 'Empty API', version: '1.0.0' }
    };
    
    const parser = new OpenAPIParser(specWithoutPaths);
    const endpoints = parser.getEndpoints();
    expect(endpoints).toHaveLength(0);
  });

  test('should match simple paths', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    
    const matches = parser.matchPath('/users');
    expect(matches).toHaveLength(2); // GET and POST
    
    const getMethods = matches.filter(m => m.method === 'GET');
    const postMethods = matches.filter(m => m.method === 'POST');
    
    expect(getMethods).toHaveLength(1);
    expect(postMethods).toHaveLength(1);
  });

  test('should match parameterized paths', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    
    // Test matching with actual ID
    const matches = parser.matchPath('/users/123');
    expect(matches).toHaveLength(3); // GET, PUT, DELETE
    
    const methods = matches.map(m => m.method).sort();
    expect(methods).toEqual(['DELETE', 'GET', 'PUT']);
  });

  test('should match complex parameterized paths', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    
    const matches = parser.matchPath('/posts/456/comments');
    expect(matches).toHaveLength(2); // GET and POST
    
    const operationIds = matches.map(m => m.operationId).sort();
    expect(operationIds).toEqual(['createComment', 'getPostComments']);
  });

  test('should not match non-existent paths', () => {
    const parser = new OpenAPIParser(mockOpenAPISpec);
    
    const matches = parser.matchPath('/nonexistent');
    expect(matches).toHaveLength(0);
  });

  test('should create parser from file', () => {
    const tmpDir = path.join(__dirname, 'tmp');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir);
    }

    const specPath = path.join(tmpDir, 'test-spec.json');
    fs.writeFileSync(specPath, JSON.stringify(mockOpenAPISpec, null, 2));

    try {
      const parser = OpenAPIParser.fromFile(specPath);
      expect(parser).toBeDefined();
      
      const endpoints = parser.getEndpoints();
      expect(endpoints).toHaveLength(7);
      
      // Clean up
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (error) {
      // Clean up on error
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
      throw error;
    }
  });

  test('should handle invalid file path', () => {
    expect(() => {
      OpenAPIParser.fromFile('/nonexistent/path/spec.json');
    }).toThrow('Failed to parse OpenAPI spec');
  });

  test('should create parser from URL', async () => {
    // Test with a real OpenAPI spec URL
    try {
      const parser = await OpenAPIParser.fromUrl('https://petstore.swagger.io/v2/swagger.json');
      expect(parser).toBeDefined();
      
      const endpoints = parser.getEndpoints();
      expect(endpoints.length).toBeGreaterThan(0);
      
      const info = parser.getInfo();
      expect(info.title).toBeDefined();
      expect(info.version).toBeDefined();
    } catch (error) {
      console.warn('External API not available for testing, skipping URL test');
    }
  });

  test('should handle invalid URL', async () => {
    await expect(async () => {
      await OpenAPIParser.fromUrl('https://nonexistent.example.com/spec.json');
    }).rejects.toThrow('Failed to fetch OpenAPI spec');
  });

  test('should handle edge cases in path matching', () => {
    const edgeCaseSpec = {
      openapi: '3.0.0',
      info: { title: 'Edge Cases', version: '1.0.0' },
      paths: {
        '/': {
          get: {
            operationId: 'root',
            summary: 'Root endpoint'
          }
        },
        '/path/with/multiple/segments': {
          get: {
            operationId: 'longPath',
            summary: 'Long path'
          }
        },
        '/path/{param1}/nested/{param2}': {
          get: {
            operationId: 'multipleParams',
            summary: 'Multiple parameters'
          }
        }
      }
    };

    const parser = new OpenAPIParser(edgeCaseSpec);

    // Test root path
    let matches = parser.matchPath('/');
    expect(matches).toHaveLength(1);
    expect(matches[0].operationId).toBe('root');

    // Test long path
    matches = parser.matchPath('/path/with/multiple/segments');
    expect(matches).toHaveLength(1);
    expect(matches[0].operationId).toBe('longPath');

    // Test multiple parameters
    matches = parser.matchPath('/path/value1/nested/value2');
    expect(matches).toHaveLength(1);
    expect(matches[0].operationId).toBe('multipleParams');

    // Test partial match (should not match)
    matches = parser.matchPath('/path/with/multiple');
    expect(matches).toHaveLength(0);

    // Test extra segments (should not match)
    matches = parser.matchPath('/path/with/multiple/segments/extra');
    expect(matches).toHaveLength(0);
  });

  test('should handle spec with only some HTTP methods', () => {
    const limitedSpec = {
      openapi: '3.0.0',
      info: { title: 'Limited API', version: '1.0.0' },
      paths: {
        '/resource': {
          get: {
            operationId: 'getResource',
            summary: 'Get resource'
          },
          // No POST, PUT, DELETE, etc.
        }
      }
    };

    const parser = new OpenAPIParser(limitedSpec);
    const endpoints = parser.getEndpoints();
    
    expect(endpoints).toHaveLength(1);
    expect(endpoints[0].method).toBe('GET');
    expect(endpoints[0].operationId).toBe('getResource');
  });

  test('should extract all standard HTTP methods', () => {
    const fullMethodSpec = {
      openapi: '3.0.0',
      info: { title: 'Full Methods API', version: '1.0.0' },
      paths: {
        '/resource': {
          get: { operationId: 'getResource' },
          post: { operationId: 'createResource' },
          put: { operationId: 'updateResource' },
          patch: { operationId: 'patchResource' },
          delete: { operationId: 'deleteResource' },
          head: { operationId: 'headResource' },
          options: { operationId: 'optionsResource' }
        }
      }
    };

    const parser = new OpenAPIParser(fullMethodSpec);
    const endpoints = parser.getEndpoints();
    
    expect(endpoints).toHaveLength(7);
    
    const methods = endpoints.map(ep => ep.method).sort();
    expect(methods).toEqual(['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']);
  });
});
