/**
 * Represents a single recorded API call during a test.
 */
export interface EndpointHit {
  method: string;
  url: string;
  /** Resolved path template, e.g. /api/users/{id} — filled in by the matcher */
  pathTemplate?: string;
  statusCode: number;
  requestBody?: unknown;
  queryParams?: Record<string, string>;
  /** Path parameters extracted from the URL, e.g. { id: '123' } */
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  testFile: string;
  testTitle: string;
}

/**
 * Coverage result for a single status code on an operation.
 */
export interface StatusCodeCoverage {
  covered: boolean;
  testRefs: string[];
}

/**
 * Coverage result for a single parameter (query / path / header / cookie).
 */
export interface ParamCoverage {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  covered: boolean;
}

/**
 * Coverage result for a single request body property.
 */
export interface BodyPropertyCoverage {
  name: string;
  required: boolean;
  covered: boolean;
}

/**
 * Coverage result for one OpenAPI operation (method + path).
 */
export interface OperationCoverage {
  path: string;
  method: string;
  operationId?: string;
  tags?: string[];
  covered: boolean;
  /** Defined response codes in spec vs whether they were exercised */
  statusCodes: Record<string, StatusCodeCoverage>;
  /** Defined parameters (query, path, header) and whether they were used */
  parameters: ParamCoverage[];
  /** Top-level request body schema properties and whether they were supplied */
  bodyProperties: BodyPropertyCoverage[];
  /** Test references that hit this operation */
  testRefs: string[];
}

/**
 * Summary statistics for one coverage dimension.
 */
export interface CoverageSummaryItem {
  total: number;
  covered: number;
  percentage: number;
}

/**
 * Top-level coverage summary.
 */
export interface CoverageSummary {
  endpoints: CoverageSummaryItem;
  statusCodes: CoverageSummaryItem;
  parameters: CoverageSummaryItem;
  bodyProperties: CoverageSummaryItem;
}

/**
 * The complete coverage result produced after a test run.
 */
export interface CoverageResult {
  specFiles: string[];
  timestamp: string;
  playwrightVersion: string;
  playswagVersion: string;
  totalTestCount: number;
  summary: CoverageSummary;
  operations: OperationCoverage[];
  uncoveredOperations: OperationCoverage[];
  /**
   * Hits that were recorded but could not be matched to any spec operation.
   * Useful for discovering undocumented endpoints.
   */
  unmatchedHits: EndpointHit[];
}

/**
 * A normalized representation of a single OpenAPI operation across Swagger 2.0 + OAS 3.x.
 */
export interface NormalizedOperation {
  pathTemplate: string;
  method: string;
  operationId?: string;
  tags?: string[];
  parameters: NormalizedParameter[];
  requestBodySchema?: NormalizedSchema;
  responses: Record<string, NormalizedResponse>;
  /**
   * The base path prefix extracted from this operation's source spec server definition.
   * E.g. `/modeling-service` or `/dmn-service`. Stripped from recorded URLs before matching.
   */
  serverBasePath?: string;
}

export interface NormalizedParameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  schema?: NormalizedSchema;
}

export interface NormalizedResponse {
  description?: string;
}

export interface NormalizedSchema {
  type?: string;
  properties?: Record<string, NormalizedSchema>;
  required?: string[];
  items?: NormalizedSchema;
  allOf?: NormalizedSchema[];
  anyOf?: NormalizedSchema[];
  oneOf?: NormalizedSchema[];
}

/**
 * Result of parsing one or more spec files, merged into a single flat list.
 */
export interface NormalizedSpec {
  /** Original source paths / URLs */
  sources: string[];
  operations: NormalizedOperation[];
  /**
   * The base path extracted from the spec's server definition (OAS3 `servers[0].url` pathname
   * or OAS2 `basePath`). Used to strip the service prefix from recorded URLs before matching.
   * E.g. `/modeling-service` for a spec whose server URL is `https://host/modeling-service`.
   */
  serverBasePath?: string;
}

/**
 * Threshold configuration for failing the run.
 */
export interface ThresholdConfig {
  /** Minimum endpoint coverage percentage (0-100) */
  endpoints?: number;
  /** Minimum status code coverage percentage (0-100) */
  statusCodes?: number;
  /** Minimum parameter coverage percentage (0-100) */
  parameters?: number;
  /** Minimum request body property coverage percentage (0-100) */
  bodyProperties?: number;
}

/**
 * Console output configuration.
 */
export interface ConsoleOutputConfig {
  /** @default true */
  enabled?: boolean;
  /** Show only uncovered / partially covered operations @default false */
  showUncoveredOnly?: boolean;
  /** Show per-operation breakdown table @default true */
  showDetails?: boolean;
  /** Expand parameter-level coverage per operation @default false */
  showParams?: boolean;
  /** Expand request body property coverage per operation @default false */
  showBodyProperties?: boolean;
}

/**
 * JSON output configuration.
 */
export interface JsonOutputConfig {
  /** @default true */
  enabled?: boolean;
  /** @default 'playswag-coverage.json' */
  fileName?: string;
  /** Pretty-print the JSON @default true */
  pretty?: boolean;
}

/**
 * Main configuration object for the Playswag reporter.
 * Pass this as the second argument in the reporter array in playwright.config.ts.
 *
 * @example
 * ```ts
 * reporter: [['playswag/reporter', {
 *   specs: ['./openapi.yaml', 'https://api.example.com/swagger.json'],
 *   outputDir: './playswag-coverage',
 *   threshold: { endpoints: 80, statusCodes: 60 },
 *   failOnThreshold: false,
 * }]]
 * ```
 */
export interface PlayswagConfig {
  /**
   * OpenAPI / Swagger spec sources. Can be:
   * - A local file path (relative to cwd or absolute): './openapi.yaml'
   * - A remote URL: 'https://api.example.com/swagger.json'
   * - An array of any combination of the above
   */
  specs: string | string[];

  /**
   * Directory to write output files into.
   * @default './playswag-coverage'
   */
  outputDir?: string;

  /**
   * Which output formats to produce.
   * @default ['console', 'json']
   */
  outputFormats?: Array<'console' | 'json'>;

  /**
   * Base URL of the API under test. Used to strip the host portion when
   * matching recorded URLs to OpenAPI path templates.
   * Auto-detected from playwright.config.ts `use.baseURL` if not provided.
   */
  baseURL?: string;

  /**
   * Only track API calls whose paths match at least one of these glob patterns.
   * Defaults to tracking everything.
   */
  includePatterns?: string[];

  /**
   * Ignore API calls whose paths match any of these glob patterns.
   */
  excludePatterns?: string[];

  /** Console output options */
  consoleOutput?: ConsoleOutputConfig;

  /** JSON file output options */
  jsonOutput?: JsonOutputConfig;

  /**
   * Coverage thresholds. When set and `failOnThreshold` is true the
   * reporter will signal a failed run if any threshold is not met.
   */
  threshold?: ThresholdConfig;

  /**
   * Whether to fail the test run when coverage falls below a threshold.
   * @default false — thresholds are informational only
   */
  failOnThreshold?: boolean;
}

/**
 * Per-test / per-project fixture options that can be overridden via test.use().
 */
export interface PlayswagFixtureOptions {
  /**
   * Set to false to disable coverage tracking for this project / file.
   * @default true
   */
  playswagEnabled: boolean;
}
