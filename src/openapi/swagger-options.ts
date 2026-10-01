import { load, JSON_SCHEMA } from 'js-yaml';
import type { SpecFetchOptions } from '../utils/spec-fetch.js';
import {
  DEFAULT_MAX_SPEC_BYTES,
  DEFAULT_SPEC_FETCH_TIMEOUT_MS,
  fetchSpecContent,
} from '../utils/spec-fetch.js';
import type { SpecSecurityOptions } from '../utils/spec-security.js';
import { createBudgetedSpecReader } from './spec-resource-budget.js';

export interface SecureSwaggerOptions extends SpecSecurityOptions {
  specFetchTimeoutMs?: number;
  maxSpecBytes?: number;
  /** When true, block file:// and local path $refs (remote root specs). */
  disableFileResolver?: boolean;
}

interface RefFileInfo {
  url: string;
}

/** Inspect parsed remote documents before the shared ref-parser can access local files.
 * The root can be local; remote children must still stay within HTTP(S) origins.
 */
function parseRemoteDocument(content: Buffer, url: string): unknown {
  let document: unknown;
  try {
    document = load(content.toString('utf8'), { schema: JSON_SCHEMA });
  } catch {
    document = load(content.toString('utf8'));
  }
  const pending: unknown[] = [document];
  const seen = new Set<object>();
  while (pending.length) {
    const value = pending.pop();
    if (!value || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const [key, child] of Object.entries(value)) {
      if (['$ref', '$id', '$dynamicRef', '$recursiveRef'].includes(key) && typeof child === 'string') {
        // Match ref-parser's path normalization, including Windows-style separators.
        const target = new URL(child.replaceAll('\\', '/'), url);
        // ref-parser's URL helper treats its placeholder origin as a relative URL,
        // turning this otherwise-valid HTTP target into a local filesystem path.
        // Reject it before the shared resolver can lose the remote provenance.
        if (target.hostname === 'aaa.nonexistanturl.com') {
          throw new Error(`Remote spec "${url}" contains a ${key} that ref-parser resolves to a local filesystem path`);
        }
        if (target.protocol !== 'http:' && target.protocol !== 'https:') {
          throw new Error(`Remote spec "${url}" contains a forbidden ${key} protocol "${target.protocol}"; local file references are not allowed in remote documents`);
        }
      }
      pending.push(child);
    }
  }
  return document;
}

/**
 * Swagger Parser / json-schema-ref-parser options with a secured HTTP resolver.
 */
export function buildSecureSwaggerParserOptions(options: SecureSwaggerOptions = {}) {
  const fetchOpts: SpecFetchOptions = {
    allowedSpecHosts: options.allowedSpecHosts,
    allowPrivateHosts: options.allowPrivateHosts,
    timeoutMs: options.specFetchTimeoutMs ?? DEFAULT_SPEC_FETCH_TIMEOUT_MS,
    maxBytes: options.maxSpecBytes ?? DEFAULT_MAX_SPEC_BYTES,
  };

  const readRemote = createBudgetedSpecReader((url, hooks) => fetchSpecContent(url, { ...fetchOpts, ...hooks }));

  return {
    resolve: {
      http: false as const,
      ...(options.disableFileResolver ? { file: false as const } : {}),
      playswagSecureHttp: {
        order: 100,
        canRead(file: RefFileInfo) {
          return typeof file.url === 'string' && /^https?:\/\//i.test(file.url);
        },
        async read(file: RefFileInfo) {
          const content = await readRemote(file.url);
          return parseRemoteDocument(content, file.url);
        },
      },
    },
    dereference: {
      circular: 'ignore' as const,
    },
  };
}
