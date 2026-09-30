import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import type {
  NormalizedOperation,
  NormalizedParameter,
  NormalizedResponse,
  NormalizedSchema,
  NormalizedSpec,
} from '../types.js';
import { log } from '../log.js';
import {
  assertRemoteSpecHostsRequired,
  isRemoteSpecSource,
} from '../utils/spec-security.js';
import { buildSecureSwaggerParserOptions } from './swagger-options.js';

export interface ParseSpecOptions {
  /** Host allowlist for remote spec URLs (required when `specs` is a URL). */
  allowedSpecHosts?: string[];
  /** Allow loopback/private hosts when fetching remote specs. @default false */
  allowPrivateHosts?: boolean;
  /** HTTP timeout per spec / $ref fetch in ms. @default 15000 */
  specFetchTimeoutMs?: number;
  /** Max bytes per spec / $ref response. @default 5242880 (5 MiB) */
  maxSpecBytes?: number;
}

function isV2(doc: OpenAPI.Document): doc is OpenAPIV2.Document {
  return 'swagger' in doc && (doc as OpenAPIV2.Document).swagger?.startsWith('2');
}

/** Normalize each schema object once, preserving shared references without expanding a DAG. */
function createSchemaExtractor(): (schema: unknown) => NormalizedSchema | undefined {
  const memo = new WeakMap<object, NormalizedSchema>();
  let work = 0;

  function extract(schema: unknown, depth: number): NormalizedSchema | undefined {
    if (++work > 100_000 || depth > 128) {
      throw new Error('OpenAPI schema exceeds normalization complexity limit (100000 visits / 128 levels)');
    }
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return undefined;
    const cached = memo.get(schema);
    if (cached) return cached;
    const s = schema as Record<string, unknown>;
    const result: NormalizedSchema = {};
    // Install the result before visiting children: recursive schemas stay finite graphs.
    memo.set(schema, result);

    if (typeof s['type'] === 'string') result.type = s['type'];
    if (typeof s['readOnly'] === 'boolean') result.readOnly = s['readOnly'];
    if (typeof s['writeOnly'] === 'boolean') result.writeOnly = s['writeOnly'];

    if (s['properties'] && typeof s['properties'] === 'object') {
      const props: Record<string, NormalizedSchema> = Object.create(null);
      for (const [key, val] of Object.entries(s['properties'])) {
        const extracted = extract(val, depth + 1);
        if (extracted) props[key] = extracted;
      }
      if (Object.keys(props).length > 0) result.properties = props;
    }
    if (Array.isArray(s['required'])) {
      result.required = s['required'].filter((name): name is string => typeof name === 'string');
    }
    if (s['items']) result.items = extract(s['items'], depth + 1);
    for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
      if (Array.isArray(s[combiner])) {
        const schemas = s[combiner].map((child) => extract(child, depth + 1))
          .filter((child): child is NormalizedSchema => child !== undefined);
        if (schemas.length > 0) result[combiner] = schemas;
      }
    }
    return result;
  }
  return (schema) => extract(schema, 0);
}

type SchemaExtractor = ReturnType<typeof createSchemaExtractor>;

/** Normalize parameters from either OAS2 or OAS3 operation. */
function normalizeParameters(
  params: unknown[] | undefined,
  extractSchema: SchemaExtractor
): NormalizedParameter[] {
  if (!params || !Array.isArray(params)) return [];
  const result: NormalizedParameter[] = [];

  for (const rawParam of params) {
    if (!rawParam || typeof rawParam !== 'object') continue;
    const p = rawParam as Record<string, unknown>;

    const name = typeof p['name'] === 'string' ? p['name'] : undefined;
    const inVal = typeof p['in'] === 'string' ? p['in'] : undefined;
    if (!name || !inVal) continue;

    const allowedIn = ['query', 'path', 'header', 'cookie'];
    if (!allowedIn.includes(inVal)) continue;

    result.push({
      name,
      in: inVal as NormalizedParameter['in'],
      required: inVal === 'path' ? true : Boolean(p['required']),
      schema: extractSchema(p['schema'] ?? p),
    });
  }

  return result;
}

/** Extract responses from an operation, including response body schema. */
function normalizeResponses(
  rawResponses: unknown,
  extractSchema: SchemaExtractor
): Record<string, NormalizedResponse> {
  if (!rawResponses || typeof rawResponses !== 'object') return {};
  const result: Record<string, NormalizedResponse> = {};

  for (const [code, raw] of Object.entries(rawResponses as object)) {
    // Specification extensions are allowed here, but are not response denominators.
    if (!/^(?:[1-5]\d{2}|[1-5]XX|default)$/.test(code)) continue;
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;

    // OAS2: schema is directly on the response object
    // OAS3: schema lives inside content[mediaType].schema
    let schema = extractSchema(r['schema']);
    if (!schema && r['content'] && typeof r['content'] === 'object') {
      const content = r['content'] as Record<string, unknown>;
      const preferred = content['application/json'] ?? Object.values(content)[0];
      if (preferred && typeof preferred === 'object') {
        schema = extractSchema((preferred as Record<string, unknown>)['schema']);
      }
    }

    result[String(code)] = {
      description: typeof r['description'] === 'string' ? r['description'] : undefined,
      schema,
    };
  }

  return result;
}

/** Extract request body schema from an OAS3 requestBody. */
function extractRequestBodySchema(requestBody: unknown, extractSchema: SchemaExtractor): NormalizedSchema | undefined {
  if (!requestBody || typeof requestBody !== 'object') return undefined;
  const rb = requestBody as Record<string, unknown>;

  const content = rb['content'];
  if (content && typeof content === 'object') {
    const mediaTypes = content as Record<string, unknown>;
    const preferred = mediaTypes['application/json'] ?? Object.values(mediaTypes)[0];
    if (preferred && typeof preferred === 'object') {
      const mt = preferred as Record<string, unknown>;
      return extractSchema(mt['schema']);
    }
  }

  return undefined;
}

/** Extract the base path from an OAS3 servers array (first entry only). */
function extractServerBasePath(servers: unknown, source?: string): string | undefined {
  if (!Array.isArray(servers) || servers.length === 0) return undefined;
  const first = (servers as Array<Record<string, unknown>>)[0];
  let url = typeof first?.['url'] === 'string' ? first['url'] : undefined;
  if (!url) return undefined;

  // Substitute OAS3 server URL variables: {varName} → variable.default
  const variables = first['variables'];
  if (variables && typeof variables === 'object') {
    const vars = variables as Record<string, { default?: string }>;
    url = url.replace(/\{([^}]+)\}/g, (_, name: string) => {
      const v = vars[name];
      if (v?.default === undefined) {
        log.warn(`[playswag] Server URL variable "{${name}}" has no default — using literal placeholder`);
        return `{${name}}`;
      }
      return v.default;
    });
  }

  try {
    // Relative servers resolve against the specification location; local specs use
    // an origin-only base because their filesystem directory is not an API path.
    const base = source && isRemoteSpecSource(source) ? source : 'https://playswag.invalid/';
    const pathname = new URL(url, base).pathname;
    const normalized = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return normalized && normalized !== '/' ? normalized : undefined;
  } catch (err) {
    log.warn(`Could not parse server URL "${url}": ${(err as Error).message}`);
    return undefined;
  }
}

/** Resolve server base path: operation.servers → pathItem.servers → document.servers. */
function resolveServerBasePath(
  operation: OpenAPIV3.OperationObject,
  pathItem: OpenAPIV3.PathItemObject,
  docServers: unknown,
  source?: string
): string | undefined {
  const servers =
    operation.servers ??
    pathItem.servers ??
    docServers;
  return extractServerBasePath(servers, source);
}

/** Convert a parsed/dereferenced OAS3 document into NormalizedOperations. */
function normalizeV3(
  doc: OpenAPIV3.Document | OpenAPIV3_1.Document,
  source: string
): NormalizedOperation[] {
  const operations: NormalizedOperation[] = [];
  const extractSchema = createSchemaExtractor();

  for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;
    const pathItemObj = pathItem as OpenAPIV3.PathItemObject;

    const methods: OpenAPIV3.HttpMethods[] = [
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace',
    ] as OpenAPIV3.HttpMethods[];

    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      const operation = op as OpenAPIV3.OperationObject;

      const pathParams = normalizeParameters(pathItemObj.parameters as unknown[] | undefined, extractSchema);
      const opParams = normalizeParameters(operation.parameters as unknown[] | undefined, extractSchema);
      const paramMap = new Map<string, NormalizedParameter>();
      for (const p of [...pathParams, ...opParams]) {
        paramMap.set(`${p.in}:${p.name}`, p);
      }

      operations.push({
        pathTemplate,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        tags: operation.tags,
        deprecated: Boolean(operation.deprecated),
        parameters: Array.from(paramMap.values()),
        requestBodySchema: extractRequestBodySchema(operation.requestBody, extractSchema),
        responses: normalizeResponses(operation.responses, extractSchema),
        serverBasePath: resolveServerBasePath(operation, pathItemObj, doc.servers, source),
      });
    }
  }

  return operations;
}

function normalizeV2(doc: OpenAPIV2.Document): NormalizedOperation[] {
  const operations: NormalizedOperation[] = [];
  const extractSchema = createSchemaExtractor();
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;

    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      const operation = op as OpenAPIV2.OperationObject;

      const pathParams = normalizeParameters(
        (pathItem as OpenAPIV2.PathItemObject).parameters as unknown[] | undefined, extractSchema
      );
      const allOpParams = normalizeParameters(
        operation.parameters as unknown[] | undefined, extractSchema
      );

      const bodyParam = (operation.parameters as unknown[] | undefined)?.find(
        (p): p is OpenAPIV2.InBodyParameterObject =>
          typeof p === 'object' && p !== null && (p as Record<string, unknown>)['in'] === 'body'
      );

      const paramMap = new Map<string, NormalizedParameter>();
      for (const p of [...pathParams, ...allOpParams]) {
        paramMap.set(`${p.in}:${p.name}`, p);
      }

      operations.push({
        pathTemplate,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        tags: operation.tags,
        deprecated: Boolean((operation as Record<string, unknown>)['deprecated']),
        parameters: Array.from(paramMap.values()),
        requestBodySchema: bodyParam ? extractSchema(bodyParam.schema) : undefined,
        responses: normalizeResponses(operation.responses, extractSchema),
      });
    }
  }

  return operations;
}

interface ParsedSpec {
  operations: NormalizedOperation[];
  serverBasePath?: string;
}

/**
 * If `source` looks like a bare hostname+path URL without a scheme
 * (e.g. `api.example.com/v2/openapi.yaml`), prepend `https://` and warn.
 * SwaggerParser only fetches sources that begin with `http://` or `https://`.
 */
function resolveSource(source: string): string {
  if (/^https?:\/\//i.test(source)) return source;
  if (source.startsWith('/') || source.startsWith('./') || source.startsWith('../')) return source;
  // Matches: hostname.tld/path  (at least one dot, then a slash)
  if (/^[a-z0-9-][a-z0-9.-]*\.[a-z]{2,}\//i.test(source)) {
    log.warn(
      `Spec source has no scheme — resolved as "https://${source}"`,
      'Prefix the URL with "https://" to suppress this warning.'
    );
    return `https://${source}`;
  }
  return source;
}

/** Module-level cache so the same spec file/URL is only dereferenced once per process. */
const parseOneCache = new Map<string, Promise<ParsedSpec>>();

function cacheKey(resolvedSource: string, options?: ParseSpecOptions): string {
  return `${resolvedSource}::${JSON.stringify(options ?? {})}`;
}

async function parseOne(source: string, options?: ParseSpecOptions): Promise<ParsedSpec> {
  const resolvedSource = resolveSource(source);
  const key = cacheKey(resolvedSource, options);

  const cached = parseOneCache.get(key);
  if (cached) {
    if (process.env['PLAYSWAG_DEBUG']) {
      console.log(`[playswag:debug] parseOne cache hit for "${source}"`);
    }
    return cached;
  }

  const parsePromise = (async (): Promise<ParsedSpec> => {
  const security = {
    allowedSpecHosts: options?.allowedSpecHosts,
    allowPrivateHosts: options?.allowPrivateHosts,
  };
  const remoteRoot = isRemoteSpecSource(resolvedSource);
  const parserOptions = buildSecureSwaggerParserOptions({
    ...security,
    specFetchTimeoutMs: options?.specFetchTimeoutMs,
    maxSpecBytes: options?.maxSpecBytes,
    disableFileResolver: remoteRoot,
  });
  const doc = await SwaggerParser.dereference(resolvedSource, parserOptions) as OpenAPI.Document;

  if (isV2(doc)) {
    const v2 = doc as OpenAPIV2.Document;
    const rawBase = typeof v2.basePath === 'string' ? v2.basePath : undefined;
    const serverBasePath = rawBase && rawBase !== '/' ? (rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase) : undefined;
    if (process.env['PLAYSWAG_DEBUG']) {
      console.log(`[playswag:debug] parseOne (OAS2) "${source}" -> serverBasePath: ${serverBasePath ?? '(none)'}`);
    }
    const operations = normalizeV2(v2).map(op => ({ ...op, serverBasePath }));
    return { operations, serverBasePath };
  } else {
    const v3 = doc as OpenAPIV3.Document;
    const serverBasePath = extractServerBasePath(v3.servers, resolvedSource);
    if (process.env['PLAYSWAG_DEBUG']) {
      console.log(`[playswag:debug] parseOne (OAS3) "${source}" -> servers[0].url: ${(v3.servers?.[0] as Record<string, unknown> | undefined)?.['url'] ?? '(none)'}, serverBasePath: ${serverBasePath ?? '(none)'}`);
    }
    const operations = normalizeV3(v3, resolvedSource);
    if (process.env['PLAYSWAG_DEBUG']) {
      const withRespSchema = operations.filter(op => Object.values(op.responses).some(r => r.schema != null)).length;
      const totalRespCodes = operations.reduce((sum, op) => sum + Object.keys(op.responses).length, 0);
      const codesWithSchema = operations.reduce((sum, op) => sum + Object.values(op.responses).filter(r => r.schema != null).length, 0);
      console.log(`[playswag:debug] parseOne schemas: ops=${operations.length} opsWithRespSchema=${withRespSchema} totalRespCodes=${totalRespCodes} codesWithSchema=${codesWithSchema}`);
    }
    return { operations, serverBasePath };
  }
  })().catch((err) => {
    parseOneCache.delete(key);
    throw err;
  });

  parseOneCache.set(key, parsePromise);
  return parsePromise;
}

/**
 * Parse one or more OpenAPI/Swagger spec sources and merge them into a
 * single normalized spec. Duplicate path+method entries across files
 * are de-duplicated (last one wins with a console warning).
 */
export async function parseSpecs(
  sources: string | string[],
  options?: ParseSpecOptions
): Promise<NormalizedSpec> {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  assertRemoteSpecHostsRequired(
    sourceList.map((s) => resolveSource(s)),
    options
  );
  const allOperations: NormalizedOperation[] = [];
  const seen = new Map<string, string>();
  const opIndex = new Map<string, number>();

  for (const source of sourceList) {
    let parsed: ParsedSpec;
    try {
      parsed = await parseOne(source, options);
    } catch (err) {
      throw new Error(
        `[playswag] Failed to parse OpenAPI spec from "${source}": ${(err as Error).message}`,
        { cause: err }
      );
    }
    const { operations: ops } = parsed;

    for (const op of ops) {
      const key = `${op.method}:${op.pathTemplate}`;
      if (seen.has(key)) {
        log.warn(`Duplicate operation ${key} in "${source}" (already seen in "${seen.get(key)}") — using latest definition.`);
        const idx = opIndex.get(key);
        if (idx !== undefined) allOperations[idx] = op;
        seen.set(key, source);
      } else {
        seen.set(key, source);
        opIndex.set(key, allOperations.length);
        allOperations.push(op);
      }
    }
  }

  return { sources: sourceList, operations: allOperations };
}
