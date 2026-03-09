import type { NormalizedOperation, NormalizedSchema, ParamCoverage, BodyPropertyCoverage, ResponsePropertyCoverage } from '../types.js';
import { log } from '../log.js';

/**
 * Recursively collect all property paths from a schema up to `maxDepth` levels deep.
 * Returns a Map of dot-notation path → required flag.
 * e.g. `{ address: { street: {} } }` at depth ≤ 3 yields `address` and `address.street`.
 */
function collectProperties(
  schema: NormalizedSchema | undefined,
  prefix: string,
  depth: number,
  maxDepth: number
): Map<string, boolean> {
  const props = new Map<string, boolean>();
  if (!schema || depth >= maxDepth) return props;

  const required = new Set(schema.required ?? []);

  if (schema.properties) {
    for (const [name, childSchema] of Object.entries(schema.properties)) {
      const fullName = prefix ? `${prefix}.${name}` : name;
      props.set(fullName, required.has(name));
      // Recurse into nested objects
      if (childSchema.type === 'object' || childSchema.properties) {
        for (const [k, v] of collectProperties(childSchema, fullName, depth + 1, maxDepth)) {
          if (!props.has(k)) props.set(k, v);
        }
      }
    }
  }

  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = schema[combiner];
    if (!schemas) continue;
    for (const sub of schemas) {
      for (const [name, req] of collectProperties(sub, prefix, depth, maxDepth)) {
        if (!props.has(name)) props.set(name, req);
      }
    }
  }

  return props;
}

/** Traverse a nested object following a dot-notation path. */
function hasNestedProperty(obj: Record<string, unknown>, dottedPath: string): boolean {
  const parts = dottedPath.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) return false;
    if (!(part in (current as Record<string, unknown>))) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return true;
}

/**
 * Analyze which defined parameters were actually used in a recorded API call.
 */
export function analyzeParameters(
  operation: NormalizedOperation,
  queryParams: Record<string, string> | undefined,
  pathParams: Record<string, string> | undefined,
  headers: Record<string, string> | undefined
): ParamCoverage[] {
  return operation.parameters.map((param) => {
    let covered = false;

    switch (param.in) {
      case 'query':
        covered = queryParams != null && param.name in queryParams;
        break;
      case 'path':
        covered = pathParams != null && param.name in pathParams;
        break;
      case 'header': {
        const lowerName = param.name.toLowerCase();
        covered =
          headers != null &&
          Object.keys(headers).some((h) => h.toLowerCase() === lowerName);
        break;
      }
      case 'cookie': {
        // Parse the Cookie header: "name1=value1; name2=value2"
        const cookieHeader = headers != null
          ? (Object.entries(headers).find(([k]) => k.toLowerCase() === 'cookie')?.[1] ?? '')
          : '';
        if (cookieHeader) {
          covered = cookieHeader.split(';').some((pair) => {
            const eqIdx = pair.indexOf('=');
            const name = eqIdx === -1 ? pair.trim() : pair.slice(0, eqIdx).trim();
            return name === param.name;
          });
        }
        break;
      }
    }

    return {
      name: param.name,
      in: param.in,
      required: param.required,
      covered,
    };
  });
}

/**
 * Analyze which top-level response body properties were present in a recorded response.
 */
export function analyzeResponseProperties(
  operation: NormalizedOperation,
  statusCode: string,
  responseBody: unknown
): ResponsePropertyCoverage[] {
  const schema = operation.responses[statusCode]?.schema;
  if (!schema) return [];

  const props = collectProperties(schema, '', 0, 3);
  if (props.size === 0) return [];

  let bodyObj: Record<string, unknown> | null = null;
  if (responseBody && typeof responseBody === 'object' && !Array.isArray(responseBody)) {
    bodyObj = responseBody as Record<string, unknown>;
  } else if (typeof responseBody === 'string') {
    try {
      const parsed: unknown = JSON.parse(responseBody);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        bodyObj = parsed as Record<string, unknown>;
      }
    } catch {
      log.warn(`Could not parse response body as JSON for ${operation.method}:${operation.pathTemplate} (status ${statusCode})`);
    }
  }

  const results = Array.from(props.entries()).map(([name, required]) => ({
    statusCode,
    name,
    required,
    covered: bodyObj != null && hasNestedProperty(bodyObj, name),
  }));

  if (process.env['PLAYSWAG_DEBUG'] && responseBody !== undefined) {
    const covCount = results.filter((r) => r.covered).length;
    console.log(`[playswag:debug] resp analysis  op=${operation.method}:${operation.pathTemplate} code=${statusCode} schema_props=${results.length} covered=${covCount} body_type=${Array.isArray(responseBody) ? 'array' : typeof responseBody}`);
  }

  return results;
}

/**
 * Analyze which top-level request body properties were actually supplied.
 */
export function analyzeBodyProperties(
  operation: NormalizedOperation,
  requestBody: unknown
): BodyPropertyCoverage[] {
  const schema = operation.requestBodySchema;
  if (!schema) return [];

  const props = collectProperties(schema, '', 0, 3);
  if (props.size === 0) return [];

  let bodyObj: Record<string, unknown> | null = null;
  if (requestBody && typeof requestBody === 'object' && !Array.isArray(requestBody)) {
    bodyObj = requestBody as Record<string, unknown>;
  } else if (typeof requestBody === 'string') {
    try {
      const parsed: unknown = JSON.parse(requestBody);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        bodyObj = parsed as Record<string, unknown>;
      }
    } catch {
      log.warn(`Could not parse request body as JSON for ${operation.method}:${operation.pathTemplate}`);
    }
  }

  return Array.from(props.entries()).map(([name, required]) => ({
    name,
    required,
    covered: bodyObj != null && hasNestedProperty(bodyObj, name),
  }));
}
