/**
 * Represents an endpoint defined in an OpenAPI specification
 */
export interface OpenAPIEndpoint {
  /** The path pattern, possibly with parameters */
  path: string;
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Optional operation ID from spec */
  operationId?: string;
  /** Optional summary description */
  summary?: string;
  /** Optional tags for categorization */
  tags?: string[];
}

/**
 * Simplified representation of an OpenAPI/Swagger specification
 */
export interface OpenAPISpec {
  /** OpenAPI version */
  openapi?: string;
  /** Legacy Swagger version */
  swagger?: string;
  /** API information */
  info?: {
    title?: string;
    version?: string;
  };
  /** API paths and operations */
  paths?: Record<string, Record<string, any>>;
  /** Server configurations */
  servers?: Array<{ url: string }>;
}
