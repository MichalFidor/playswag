import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPI, OpenAPIV2, OpenAPIV3, OpenAPIV3_1 } from 'openapi-types';
import type {
  NormalizedOperation,
  NormalizedParameter,
  NormalizedResponse,
  NormalizedSchema,
  NormalizedSpec,
} from '../types.js';

function isV2(doc: OpenAPI.Document): doc is OpenAPIV2.Document {
  return 'swagger' in doc && (doc as OpenAPIV2.Document).swagger?.startsWith('2');
}

/** Best-effort schema extraction from a possibly-dereferenced schema object. */
function extractSchema(schema: unknown): NormalizedSchema | undefined {
  if (!schema || typeof schema !== 'object') return undefined;
  const s = schema as Record<string, unknown>;
  const result: NormalizedSchema = {};

  if (typeof s['type'] === 'string') result.type = s['type'];

  if (s['properties'] && typeof s['properties'] === 'object') {
    const props: Record<string, NormalizedSchema> = {};
    for (const [key, val] of Object.entries(s['properties'] as object)) {
      const extracted = extractSchema(val);
      if (extracted) props[key] = extracted;
    }
    if (Object.keys(props).length > 0) result.properties = props;
  }

  if (Array.isArray(s['required'])) {
    result.required = s['required'] as string[];
  }

  if (s['items']) {
    const items = extractSchema(s['items']);
    if (items) result.items = items;
  }

  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    if (Array.isArray(s[combiner])) {
      const schemas = (s[combiner] as unknown[]).map(extractSchema).filter(Boolean) as NormalizedSchema[];
      if (schemas.length > 0) result[combiner] = schemas;
    }
  }

  return Object.keys(result).length ? result : undefined;
}

/** Normalize parameters from either OAS2 or OAS3 operation. */
function normalizeParameters(
  params: unknown[] | undefined
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
  rawResponses: unknown
): Record<string, NormalizedResponse> {
  if (!rawResponses || typeof rawResponses !== 'object') return {};
  const result: Record<string, NormalizedResponse> = {};

  for (const [code, raw] of Object.entries(rawResponses as object)) {
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
function extractRequestBodySchema(requestBody: unknown): NormalizedSchema | undefined {
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
function extractServerBasePath(servers: unknown): string | undefined {
  if (!Array.isArray(servers) || servers.length === 0) return undefined;
  const first = (servers as Array<Record<string, unknown>>)[0];
  const url = typeof first?.['url'] === 'string' ? first['url'] : undefined;
  if (!url) return undefined;
  try {
    const pathname = new URL(url).pathname;
    const normalized = pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
    return normalized && normalized !== '/' ? normalized : undefined;
  } catch (err) {
    console.warn(`[playswag] Could not parse server URL "${url}": ${(err as Error).message}`);
    return undefined;
  }
}

/** Convert a parsed/dereferenced OAS3 document into NormalizedOperations. */
function normalizeV3(
  doc: OpenAPIV3.Document | OpenAPIV3_1.Document
): NormalizedOperation[] {
  const operations: NormalizedOperation[] = [];

  for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;

    const methods: OpenAPIV3.HttpMethods[] = [
      'get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'trace',
    ] as OpenAPIV3.HttpMethods[];

    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      const operation = op as OpenAPIV3.OperationObject;

      const pathParams = normalizeParameters(
        (pathItem as OpenAPIV3.PathItemObject).parameters as unknown[] | undefined
      );
      const opParams = normalizeParameters(
        operation.parameters as unknown[] | undefined
      );
      const paramMap = new Map<string, NormalizedParameter>();
      for (const p of [...pathParams, ...opParams]) {
        paramMap.set(`${p.in}:${p.name}`, p);
      }

      operations.push({
        pathTemplate,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        tags: operation.tags,
        parameters: Array.from(paramMap.values()),
        requestBodySchema: extractRequestBodySchema(operation.requestBody),
        responses: normalizeResponses(operation.responses),
      });
    }
  }

  return operations;
}

/** Convert a dereferenced Swagger 2.0 document into NormalizedOperations. */
function normalizeV2(doc: OpenAPIV2.Document): NormalizedOperation[] {
  const operations: NormalizedOperation[] = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [pathTemplate, pathItem] of Object.entries(doc.paths ?? {})) {
    if (!pathItem) continue;

    for (const method of methods) {
      const op = (pathItem as Record<string, unknown>)[method];
      if (!op || typeof op !== 'object') continue;
      const operation = op as OpenAPIV2.OperationObject;

      const pathParams = normalizeParameters(
        (pathItem as OpenAPIV2.PathItemObject).parameters as unknown[] | undefined
      );
      const allOpParams = normalizeParameters(
        operation.parameters as unknown[] | undefined
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
        parameters: Array.from(paramMap.values()),
        requestBodySchema: bodyParam ? extractSchema(bodyParam.schema) : undefined,
        responses: normalizeResponses(operation.responses),
      });
    }
  }

  return operations;
}

interface ParsedSpec {
  operations: NormalizedOperation[];
  serverBasePath?: string;
}

async function parseOne(source: string): Promise<ParsedSpec> {
  const doc = await SwaggerParser.dereference(source) as OpenAPI.Document;

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
    const serverBasePath = extractServerBasePath(v3.servers);
    if (process.env['PLAYSWAG_DEBUG']) {
      console.log(`[playswag:debug] parseOne (OAS3) "${source}" -> servers[0].url: ${(v3.servers?.[0] as Record<string, unknown> | undefined)?.['url'] ?? '(none)'}, serverBasePath: ${serverBasePath ?? '(none)'}`);
    }
    const operations = normalizeV3(v3).map(op => ({ ...op, serverBasePath }));
    return { operations, serverBasePath };
  }
}

/**
 * Parse one or more OpenAPI/Swagger spec sources and merge them into a
 * single normalized spec. Duplicate path+method entries across files
 * are de-duplicated (last one wins with a console warning).
 */
export async function parseSpecs(sources: string | string[]): Promise<NormalizedSpec> {
  const sourceList = Array.isArray(sources) ? sources : [sources];
  const allOperations: NormalizedOperation[] = [];
  const seen = new Map<string, string>();

  for (const source of sourceList) {
    let parsed: ParsedSpec;
    try {
      parsed = await parseOne(source);
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
        console.warn(
          `[playswag] Duplicate operation ${key} found in "${source}" (already seen in "${seen.get(key)}"). Using the latest definition.`
        );
        const idx = allOperations.findIndex(
          (o) => o.method === op.method && o.pathTemplate === op.pathTemplate
        );
        if (idx !== -1) allOperations.splice(idx, 1);
      }
      seen.set(key, source);
      allOperations.push(op);
    }
  }

  return { sources: sourceList, operations: allOperations };
}
