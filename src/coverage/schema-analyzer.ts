import type { NormalizedOperation, NormalizedSchema, ParamCoverage, BodyPropertyCoverage, ResponsePropertyCoverage } from '../types.js';

/** Retrieve the top-level properties of a schema, merging allOf/anyOf/oneOf. */
function collectTopLevelProperties(schema: NormalizedSchema | undefined): Map<string, boolean> {
  const props = new Map<string, boolean>();
  if (!schema) return props;

  const required = new Set(schema.required ?? []);

  if (schema.properties) {
    for (const name of Object.keys(schema.properties)) {
      props.set(name, required.has(name));
    }
  }

  for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
    const schemas = schema[combiner];
    if (!schemas) continue;
    for (const sub of schemas) {
      const subProps = collectTopLevelProperties(sub);
      for (const [name, req] of subProps) {
        if (!props.has(name)) props.set(name, req);
      }
    }
  }

  return props;
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
      case 'cookie':
        covered = false;
        break;
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

  const props = collectTopLevelProperties(schema);
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
      console.warn(`[playswag] Could not parse response body as JSON for ${operation.method}:${operation.pathTemplate} (status ${statusCode})`);
    }
  }

  const results = Array.from(props.entries()).map(([name, required]) => ({
    statusCode,
    name,
    required,
    covered: bodyObj != null && name in bodyObj,
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

  const props = collectTopLevelProperties(schema);
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
      console.warn(`[playswag] Could not parse request body as JSON for ${operation.method}:${operation.pathTemplate}`);
    }
  }

  return Array.from(props.entries()).map(([name, required]) => ({
    name,
    required,
    covered: bodyObj != null && name in bodyObj,
  }));
}
