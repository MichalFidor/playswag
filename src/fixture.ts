import {
  test as base,
  expect,
  defineConfig as baseDefineConfig,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
  type PlaywrightTestConfig,
} from '@playwright/test';
import type { AcknowledgedService, EndpointHit, PlayswagFixtureOptions } from './types.js';
import { ATTACHMENT_NAME } from './constants.js';
import { safeJsonStringify } from './utils/safe-json.js';
import {
  DEFAULT_REDACT_BODY_FIELDS,
  redactSensitiveFields,
} from './utils/redact-body.js';
import { log } from './log.js';

export { expect };
export { ATTACHMENT_NAME } from './constants.js';

export const DEFAULT_REDACT_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'proxy-authorization',
];

export const DEFAULT_MAX_RESPONSE_BODY_BYTES = 256 * 1024;
export const DEFAULT_MAX_HITS_PER_TEST = 500;

export { DEFAULT_REDACT_BODY_FIELDS, redactSensitiveFields } from './utils/redact-body.js';

/**
 * Type-aware wrapper around Playwright's `defineConfig` that makes playswag fixture
 * options (`playswagSpecs`, `playswagBaseURL`, `playswagEnabled`, `captureResponseBody`)
 * available in each project's `use` block without TypeScript errors.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function defineConfig<T = {}, W = {}>(
  config: PlaywrightTestConfig<T & PlayswagFixtureOptions, W>
): PlaywrightTestConfig<T & PlayswagFixtureOptions, W> {
  return baseDefineConfig(config) as PlaywrightTestConfig<T & PlayswagFixtureOptions, W>;
}

const INTERCEPTED_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;
type HttpMethod = (typeof INTERCEPTED_METHODS)[number];

export function redactHeaders(
  headers: Record<string, string>,
  redactList: string[]
): Record<string, string> {
  const redact = new Set(redactList.map((h) => h.toLowerCase()));
  return Object.fromEntries(
    Object.entries(headers).map(([k, v]) => [
      k,
      redact.has(k.toLowerCase()) ? '[REDACTED]' : v,
    ])
  );
}

/**
 * Build a Proxy around an APIRequestContext that records every HTTP call.
 * Exported for unit tests — production code uses via `trackRequest` / `request` fixtures.
 */
export function buildTrackedRequest<T extends APIRequestContext>(
  original: T,
  hits: EndpointHit[],
  testInfo: TestInfo,
  options: {
    captureResponseBody?: boolean;
    captureHeaders?: boolean;
    maxResponseBodyBytes?: number;
    redactHeaders?: string[];
    redactBody?: boolean;
    redactBodyFields?: string[];
    maxHitsPerTest?: number;
  } = {}
): T {
  const captureResponseBody = options.captureResponseBody ?? true;
  const captureHeaders = options.captureHeaders ?? true;
  const maxResponseBodyBytes = options.maxResponseBodyBytes ?? DEFAULT_MAX_RESPONSE_BODY_BYTES;
  const redactList = options.redactHeaders ?? DEFAULT_REDACT_HEADERS;
  const redactBody = options.redactBody ?? true;
  const redactBodyFields = options.redactBodyFields ?? DEFAULT_REDACT_BODY_FIELDS;
  const maxHitsPerTest = options.maxHitsPerTest ?? DEFAULT_MAX_HITS_PER_TEST;
  let hitLimitWarned = false;

  return new Proxy(original, {
    get(target, prop, receiver) {
      if (!INTERCEPTED_METHODS.includes(prop as HttpMethod)) {
        return Reflect.get(target, prop, receiver);
      }

      const method = prop as HttpMethod;

      return async (urlOrRequest: string | object, opts?: Record<string, unknown>): Promise<APIResponse> => {
        let httpMethod: string;
        if (method === 'fetch') {
          httpMethod = (
            typeof opts?.['method'] === 'string' ? opts['method'] : 'GET'
          ).toUpperCase();
        } else {
          httpMethod = method.toUpperCase();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: APIResponse = await (target[method] as any).call(target, urlOrRequest, opts);

        let queryParams: Record<string, string> | undefined;
        const rawParams = opts?.['params'];
        if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
          queryParams = Object.fromEntries(
            Object.entries(rawParams as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          );
        }
        try {
          const urlSearchParams = new URL(response.url()).searchParams;
          if (urlSearchParams.size > 0) {
            const fromUrl: Record<string, string> = {};
            urlSearchParams.forEach((value, key) => { fromUrl[key] = value; });
            queryParams = { ...fromUrl, ...queryParams };
          }
        } catch {
          // Invalid URL — skip URL param extraction
        }

        let headers: Record<string, string> | undefined;
        if (captureHeaders) {
          const rawHeaders = opts?.['headers'];
          if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
            headers = redactHeaders(
              Object.fromEntries(
                Object.entries(rawHeaders as Record<string, string>).map(([k, v]) => [k, String(v)])
              ),
              redactList
            );
          }
        }

        let requestBody: unknown =
          opts?.['data'] ?? opts?.['form'] ?? opts?.['multipart'] ?? undefined;
        if (redactBody && requestBody !== undefined) {
          requestBody = redactSensitiveFields(requestBody, redactBodyFields);
        }

        let responseBody: unknown | undefined;
        if (captureResponseBody) {
          try {
            const raw = await response.body();
            if (raw.length > 0 && raw.length <= maxResponseBodyBytes) {
              const contentType = response.headers()['content-type'] ?? '';
              if (!contentType || /json|\+json/i.test(contentType)) {
                responseBody = JSON.parse(raw.toString('utf8'));
                if (redactBody) {
                  responseBody = redactSensitiveFields(responseBody, redactBodyFields);
                }
              }
            }
          } catch {
            // Non-JSON, oversized, or empty response — skip body capture
          }
        }

        if (hits.length >= maxHitsPerTest) {
          if (!hitLimitWarned) {
            hitLimitWarned = true;
            log.warn(
              `Max hits per test (${maxHitsPerTest}) reached — further API calls in this test are not recorded`,
              'Raise maxHitsPerTest in test.use() or split the test'
            );
          }
          return response;
        }

        hits.push({
          method: httpMethod,
          url: response.url(),
          statusCode: response.status(),
          requestBody,
          responseBody,
          queryParams,
          headers,
          testFile: testInfo.titlePath[0] ?? '',
          testTitle: testInfo.title,
        });

        return response;
      };
    },
  }) as T;
}


type PlayswagOptions = {
  playswagEnabled: boolean;
  captureResponseBody: boolean;
  captureHeaders: boolean;
  maxResponseBodyBytes: number;
  redactHeaders: string[];
  redactBody: boolean;
  redactBodyFields: string[];
  maxHitsPerTest: number;
  playswagSpecs: string | string[] | undefined;
  playswagBaseURL: string | undefined;
  playswagAcknowledgedServices: AcknowledgedService[] | undefined;
};

export type PlayswagFixtures = {
  trackRequest: <T extends APIRequestContext>(ctx: T) => T;
};

export const test = base.extend<PlayswagOptions & PlayswagFixtures>({
  playswagEnabled: [true, { option: true }],
  captureResponseBody: [true, { option: true }],
  captureHeaders: [true, { option: true }],
  maxResponseBodyBytes: [DEFAULT_MAX_RESPONSE_BODY_BYTES, { option: true }],
  redactHeaders: [DEFAULT_REDACT_HEADERS, { option: true }],
  redactBody: [true, { option: true }],
  redactBodyFields: [DEFAULT_REDACT_BODY_FIELDS, { option: true }],
  maxHitsPerTest: [DEFAULT_MAX_HITS_PER_TEST, { option: true }],
  playswagSpecs: [undefined, { option: true }],
  playswagBaseURL: [undefined, { option: true }],
  playswagAcknowledgedServices: [undefined, { option: true }],

  trackRequest: async (
    {
      playswagEnabled,
      captureResponseBody,
      captureHeaders,
      maxResponseBodyBytes,
      redactHeaders: redactList,
      redactBody,
      redactBodyFields,
      maxHitsPerTest,
    }: PlayswagOptions,
    use: (fn: <T extends APIRequestContext>(ctx: T) => T) => Promise<void>,
    testInfo: TestInfo
  ) => {
    if (!playswagEnabled) {
      await use(<T extends APIRequestContext>(ctx: T) => ctx);
      return;
    }

    const hits: EndpointHit[] = [];
    await use(<T extends APIRequestContext>(ctx: T) =>
      buildTrackedRequest(ctx, hits, testInfo, {
        captureResponseBody,
        captureHeaders,
        maxResponseBodyBytes,
        redactHeaders: redactList,
        redactBody,
        redactBodyFields,
        maxHitsPerTest,
      })
    );

    if (hits.length > 0) {
      await testInfo.attach(ATTACHMENT_NAME, {
        body: Buffer.from(safeJsonStringify(hits), 'utf8'),
        contentType: 'application/json',
      });
    }
  },

  request: async (
    { request, trackRequest }: { request: APIRequestContext; trackRequest: <T extends APIRequestContext>(ctx: T) => T },
    use: (r: APIRequestContext) => Promise<void>
  ) => {
    await use(trackRequest(request));
  },
});
