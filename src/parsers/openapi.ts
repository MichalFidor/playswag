import { OpenAPIEndpoint, OpenAPISpec } from '../types/openapi';
import { readJsonFile } from '../utils/file';
import { fetchJson } from '../utils/http';

export class OpenAPIParser {
  private spec: OpenAPISpec;

  constructor(spec: OpenAPISpec) {
    this.spec = spec;
  }

  /**
   * Creates a parser instance from an OpenAPI spec URL
   */
  static async fromUrl(url: string): Promise<OpenAPIParser> {
    try {
      const spec = await fetchJson<OpenAPISpec>(url);
      return new OpenAPIParser(spec);
    } catch (error) {
      throw new Error(`Failed to fetch OpenAPI spec: ${error}`);
    }
  }

  /**
   * Creates a parser instance from a local JSON file
   */
  static fromFile(filePath: string): OpenAPIParser {
    try {
      const spec = readJsonFile<OpenAPISpec>(filePath);
      return new OpenAPIParser(spec);
    } catch (error) {
      throw new Error(`Failed to parse OpenAPI spec: ${error}`);
    }
  }

  /**
   * Extracts all endpoints from the OpenAPI spec
   */
  getEndpoints(): OpenAPIEndpoint[] {
    const endpoints: OpenAPIEndpoint[] = [];

    if (!this.spec.paths) {
      return endpoints;
    }

    const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

    for (const [path, pathItem] of Object.entries(this.spec.paths)) {
      for (const method of methods) {
        if (pathItem[method]) {
          const operation = pathItem[method];
          endpoints.push({
            path,
            method: method.toUpperCase(),
            operationId: operation.operationId,
            summary: operation.summary,
            tags: operation.tags,
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Gets the base URL from the servers array
   */
  getBaseUrl(): string | undefined {
    return this.spec.servers?.[0]?.url;
  }

  /**
   * Gets API info (title, version)
   */
  getInfo(): { title?: string; version?: string } {
    return this.spec.info || {};
  }

  /**
   * Finds OpenAPI endpoints matching a request path
   */
  matchPath(requestPath: string): OpenAPIEndpoint[] {
    const endpoints = this.getEndpoints();

    return endpoints.filter(endpoint => {
      // Convert OpenAPI path parameters to regex
      const regexPath = endpoint.path.replace(/\{[^}]+\}/g, '[^/]+').replace(/\//g, '\\/');

      const regex = new RegExp(`^${regexPath}$`);
      return regex.test(requestPath);
    });
  }
}
