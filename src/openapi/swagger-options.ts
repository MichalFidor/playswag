import type { SpecFetchOptions } from '../utils/spec-fetch.js';
import {
  DEFAULT_MAX_SPEC_BYTES,
  DEFAULT_SPEC_FETCH_TIMEOUT_MS,
  fetchSpecContent,
} from '../utils/spec-fetch.js';
import type { SpecSecurityOptions } from '../utils/spec-security.js';

export interface SecureSwaggerOptions extends SpecSecurityOptions {
  specFetchTimeoutMs?: number;
  maxSpecBytes?: number;
  /** When true, block file:// and local path $refs (remote root specs). */
  disableFileResolver?: boolean;
}

interface RefFileInfo {
  url: string;
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
          return fetchSpecContent(file.url, fetchOpts);
        },
      },
    },
    dereference: {
      circular: 'ignore' as const,
    },
  };
}
