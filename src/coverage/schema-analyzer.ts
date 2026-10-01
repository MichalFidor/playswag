import type { NormalizedOperation, NormalizedSchema, ParamCoverage, BodyPropertyCoverage, ResponsePropertyCoverage } from '../types.js';
import { log } from '../log.js';
import { resolveResponseKey } from './response-resolver.js';

// null denotes an array item; string tokens preserve literal property names (including dots).
type PropertyToken = string | null;
interface SchemaProperty {
  name: string;
  required: boolean;
  path: PropertyToken[];
}
const schemaPropertyCache = new WeakMap<NormalizedSchema, Map<string, SchemaProperty[]>>();
const DEFAULT_SCHEMA_DEPTH = 3;

function normalizeDepth(value: number): number {
  return Number.isFinite(value) ? Math.min(10, Math.max(1, Math.floor(value))) : DEFAULT_SCHEMA_DEPTH;
}

function propertyName(path: PropertyToken[]): string {
  return path.reduce<string>((name, token) => {
    if (token === null) return `${name}[]`;
    // Quote literal separators so e.g. an 'a.b' field cannot collide with nested a.b.
    if (token.length === 0 || /[.[\]\\"]/.test(token)) return `${name}[${JSON.stringify(token)}]`;
    return `${name}${name ? '.' : ''}${token}`;
  }, '');
}

/** Collect a bounded set of paths; memoization keeps shared allOf/anyOf DAGs linear. */
function collectProperties(schema: NormalizedSchema, maxDepth: number, mode: 'request' | 'response'): SchemaProperty[] {
  const cacheKey = `${mode}:${maxDepth}`;
  const cached = schemaPropertyCache.get(schema)?.get(cacheKey);
  if (cached) return cached;
  const memo = new WeakMap<NormalizedSchema, Map<number, SchemaProperty[]>>();
  const active = new WeakMap<NormalizedSchema, Set<number>>();
  let work = 0;
  let cycleCuts = 0;
  function consume(): void {
    if (++work > 100_000) throw new Error('OpenAPI schema exceeds property analysis complexity limit (100000 visits)');
  }
  function visit(node: NormalizedSchema, remaining: number, level: number): SchemaProperty[] {
    consume();
    if (level > 128) throw new Error('OpenAPI schema exceeds property analysis depth limit (128 levels)');
    if (remaining <= 0 || (mode === 'request' ? node.readOnly : node.writeOnly)) return [];
    const known = memo.get(node)?.get(remaining);
    if (known) return known;
    if (active.get(node)?.has(remaining)) {
      cycleCuts++;
      return [];
    }
    const cutsBefore = cycleCuts;
    const activeDepths = active.get(node) ?? new Set<number>();
    activeDepths.add(remaining);
    active.set(node, activeDepths);
    const props = new Map<string, SchemaProperty>();
    function add(path: PropertyToken[], required: boolean): void {
      consume();
      const key = JSON.stringify(path);
      const existing = props.get(key);
      if (existing) existing.required ||= required;
      else props.set(key, { name: propertyName(path), path, required });
      if (props.size > 10_000) throw new Error('OpenAPI schema exceeds property count limit (10000 properties)');
    }
    const required = new Set(node.required ?? []);
    for (const [name, child] of Object.entries(node.properties ?? {})) {
      if (mode === 'request' ? child.readOnly : child.writeOnly) continue;
      add([name], required.has(name));
      for (const property of visit(child, remaining - 1, level + 1)) {
        add([name, ...property.path], property.required);
      }
    }
    if (node.items) {
      for (const property of visit(node.items, remaining, level + 1)) {
        add([null, ...property.path], property.required);
      }
    }
    for (const combiner of ['allOf', 'anyOf', 'oneOf'] as const) {
      for (const child of node[combiner] ?? []) {
        for (const property of visit(child, remaining, level + 1)) {
          add(property.path, property.required);
        }
      }
    }
    activeDepths.delete(remaining);
    const byDepth = memo.get(node) ?? new Map<number, SchemaProperty[]>();
    const result = [...props.values()];
    // A cycle-pruned result depends on its ancestors. Reusing it under another
    // property prefix would silently omit the ancestors' fields from coverage.
    if (cutsBefore === cycleCuts) {
      byDepth.set(remaining, result);
      memo.set(node, byDepth);
    }
    return result;
  }
  const result = visit(schema, maxDepth, 0);
  const cachedDepths = schemaPropertyCache.get(schema) ?? new Map<string, SchemaProperty[]>();
  cachedDepths.set(cacheKey, result);
  schemaPropertyCache.set(schema, cachedDepths);
  return result;
}

function parseBody(body: unknown, warning: string): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    if (body.length > 0) log.warn(warning);
    return undefined;
  }
}

/** Inspect all array elements, following schema paths rather than flattening object bodies. */
function inspectProperties(properties: SchemaProperty[], body: unknown): BodyPropertyCoverage[] {
  let work = 0;
  function hasPath(value: unknown, path: PropertyToken[], index: number): boolean {
    if (++work > 1_000_000) throw new Error('Body exceeds property inspection complexity limit (1000000 visits)');
    if (index === path.length) return true;
    const token = path[index]!;
    if (token === null) {
      return Array.isArray(value) && value.some((item) => hasPath(item, path, index + 1));
    }
    return value !== null && typeof value === 'object' && !Array.isArray(value)
      && Object.hasOwn(value, token)
      && hasPath((value as Record<string, unknown>)[token], path, index + 1);
  }
  return properties.map(({ name, path, required }) => ({ name, required, covered: hasPath(body, path, 0) }));
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
        covered = queryParams != null && Object.hasOwn(queryParams, param.name);
        break;
      case 'path':
        covered = pathParams != null && Object.hasOwn(pathParams, param.name);
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

/** Analyze response properties using the same exact/range/default key as status coverage. */
export function analyzeResponseProperties(
  operation: NormalizedOperation,
  statusCode: string,
  responseBody: unknown,
  schemaDepth = DEFAULT_SCHEMA_DEPTH
): ResponsePropertyCoverage[] {
  const responseKey = resolveResponseKey(operation.responses, statusCode);
  const schema = responseKey === undefined ? undefined : operation.responses[responseKey]?.schema;
  if (!schema || responseKey === undefined) return [];
  const props = collectProperties(schema, normalizeDepth(schemaDepth), 'response');
  const body = parseBody(responseBody, `Could not parse response body as JSON for ${operation.method}:${operation.pathTemplate} (status ${statusCode})`);
  return inspectProperties(props, body).map((property) => ({ statusCode: responseKey, ...property }));
}

/** Analyze request properties, including objects nested inside arrays. */
export function analyzeBodyProperties(
  operation: NormalizedOperation,
  requestBody: unknown,
  schemaDepth = DEFAULT_SCHEMA_DEPTH
): BodyPropertyCoverage[] {
  const schema = operation.requestBodySchema;
  if (!schema) return [];
  const props = collectProperties(schema, normalizeDepth(schemaDepth), 'request');
  const body = parseBody(requestBody, `Could not parse request body as JSON for ${operation.method}:${operation.pathTemplate}`);
  return inspectProperties(props, body);
}
