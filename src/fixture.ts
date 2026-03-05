import {
  test as base,
  expect,
  defineConfig as baseDefineConfig,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
  type PlaywrightTestConfig,
} from '@playwright/test';
import type { EndpointHit, PlayswagFixtureOptions } from './types.js';
import { ATTACHMENT_NAME } from './constants.js';

export { expect };
export { ATTACHMENT_NAME } from './constants.js';

/**
 * Type-aware wrapper around Playwright's `defineConfig` that makes playswag fixture
 * options (`playswagSpecs`, `playswagBaseURL`, `playswagEnabled`, `captureResponseBody`)
 * available in each project's `use` block without TypeScript errors.
 *
 * Replace the `@playwright/test` import in your `playwright.config.ts`:
 * ```ts
 * // Before:
 * import { defineConfig } from '@playwright/test';
 * // After:
 * import { defineConfig } from '@michalfidor/playswag';
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function defineConfig<T = {}, W = {}>(
  config: PlaywrightTestConfig<T & PlayswagFixtureOptions, W>
): PlaywrightTestConfig<T & PlayswagFixtureOptions, W> {
  return baseDefineConfig(config) as PlaywrightTestConfig<T & PlayswagFixtureOptions, W>;
}

const INTERCEPTED_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;
type HttpMethod = (typeof INTERCEPTED_METHODS)[number];

/**
 * Build a Proxy around an APIRequestContext that records every HTTP call.
 * Generic so the original type (e.g. a CustomAPIRequest subtype) is preserved.
 */
function buildTrackedRequest<T extends APIRequestContext>(
  original: T,
  hits: EndpointHit[],
  testInfo: TestInfo,
  captureResponseBody = true
): T {
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (!INTERCEPTED_METHODS.includes(prop as HttpMethod)) {
        return Reflect.get(target, prop, receiver);
      }

      const method = prop as HttpMethod;

      return async (urlOrRequest: string | object, options?: Record<string, unknown>): Promise<APIResponse> => {
        let httpMethod: string;
        if (method === 'fetch') {
          httpMethod = (
            typeof options?.['method'] === 'string' ? options['method'] : 'GET'
          ).toUpperCase();
        } else {
          httpMethod = method.toUpperCase();
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response: APIResponse = await (target[method] as any).call(target, urlOrRequest, options);

        let queryParams: Record<string, string> | undefined;
        const rawParams = options?.['params'];
        if (rawParams && typeof rawParams === 'object' && !Array.isArray(rawParams)) {
          queryParams = Object.fromEntries(
            Object.entries(rawParams as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          );
        }

        let headers: Record<string, string> | undefined;
        const rawHeaders = options?.['headers'];
        if (rawHeaders && typeof rawHeaders === 'object' && !Array.isArray(rawHeaders)) {
          headers = Object.fromEntries(
            Object.entries(rawHeaders as Record<string, string>).map(([k, v]) => [k, String(v)])
          );
        }

        const requestBody = options?.['data'] ?? options?.['form'] ?? options?.['multipart'] ?? undefined;

        // Capture the response body JSON for response coverage (opt-out via captureResponseBody: false).
        // We use response.body() + JSON.parse rather than response.json() because Playwright's
        // json() throws on any Content-Type that isn't exactly 'application/json'
        // (e.g. 'application/json; charset=utf-8', 'application/hal+json', etc.).
        let responseBody: unknown | undefined;
        if (captureResponseBody) {
          try {
            const raw = await response.body();
            if (raw.length > 0) {
              responseBody = JSON.parse(raw.toString('utf8'));
            }
          } catch {
            // Non-JSON or empty response - skip body capture
          }
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
  /** Set to false to disable coverage tracking for this project/file. @default true */
  playswagEnabled: boolean;
  /** Set to false to opt out of response body capture (e.g. for large binary responses). @default true */
  captureResponseBody: boolean;
  /** Per-project OpenAPI/Swagger spec path(s) that override the reporter-level `specs`. */
  playswagSpecs: string | string[] | undefined;
  /** Per-project base URL that overrides `baseURL` when stripping URL prefixes during matching. */
  playswagBaseURL: string | undefined;
};

/**
 * Fixtures added by playswag, available in any test or fixture that extends `test`.
 *
 * `trackRequest` wraps any `APIRequestContext` (including custom subtypes) so
 * that every HTTP call made through it is recorded for coverage.  All hits from
 * all wrapped contexts within a single test are combined into one attachment.
 *
 * @example
 * // In your context fixture:
 * myServiceContext: async ({ trackRequest }, use) => {
 *   const raw = await ContextFactory.getContextByUserAccessToken('user');
 *   await use(trackRequest(raw));
 * },
 */
export type PlayswagFixtures = {
  trackRequest: <T extends APIRequestContext>(ctx: T) => T;
};

/**
 * `test` extended from `@playwright/test` with transparent API coverage tracking.
 *
 * Just replace:
 *   import { test, expect } from '@playwright/test';
 * with:
 *   import { test, expect } from '@michalfidor/playswag';
 *
 * The `request` fixture is automatically wrapped — no other changes needed.
 *
 * For tests that use custom `APIRequestContext` objects (e.g. created via
 * `request.newContext()`), use the `trackRequest` fixture to wrap them:
 *   myContext: async ({ trackRequest }, use) => { use(trackRequest(raw)); }
 *
 * Disable tracking per-project or per-file with:
 *   test.use({ playswagEnabled: false });
 */
export const test = base.extend<PlayswagOptions & PlayswagFixtures>({
  playswagEnabled: [true, { option: true }],
  captureResponseBody: [true, { option: true }],
  playswagSpecs: [undefined, { option: true }],
  playswagBaseURL: [undefined, { option: true }],

  trackRequest: async (
    { playswagEnabled, captureResponseBody }: { playswagEnabled: boolean; captureResponseBody: boolean },
    use: (fn: <T extends APIRequestContext>(ctx: T) => T) => Promise<void>,
    testInfo: TestInfo
  ) => {
    if (!playswagEnabled) {
      await use(<T extends APIRequestContext>(ctx: T) => ctx);
      return;
    }

    const hits: EndpointHit[] = [];
    await use(<T extends APIRequestContext>(ctx: T) => buildTrackedRequest(ctx, hits, testInfo, captureResponseBody));

    if (hits.length > 0) {
      await testInfo.attach(ATTACHMENT_NAME, {
        body: Buffer.from(JSON.stringify(hits), 'utf8'),
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
