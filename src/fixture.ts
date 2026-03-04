import {
  test as base,
  expect,
  type APIRequestContext,
  type APIResponse,
  type TestInfo,
} from '@playwright/test';
import type { EndpointHit } from './types.js';
import { ATTACHMENT_NAME } from './constants.js';

export { expect };
export { ATTACHMENT_NAME } from './constants.js';

const INTERCEPTED_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'fetch'] as const;
type HttpMethod = (typeof INTERCEPTED_METHODS)[number];

/**
 * Build a Proxy around an APIRequestContext that records every HTTP call.
 * Generic so the original type (e.g. a CustomAPIRequest subtype) is preserved.
 */
function buildTrackedRequest<T extends APIRequestContext>(
  original: T,
  hits: EndpointHit[],
  testInfo: TestInfo
): T {
  return new Proxy(original, {
    get(target, prop, receiver) {
      if (!INTERCEPTED_METHODS.includes(prop as HttpMethod)) {
        return Reflect.get(target, prop, receiver);
      }

      const method = prop as HttpMethod;

      return async (urlOrRequest: string | any, options?: Record<string, unknown>): Promise<APIResponse> => {
        let httpMethod: string;
        if (method === 'fetch') {
          httpMethod = (
            typeof options?.['method'] === 'string' ? options['method'] : 'GET'
          ).toUpperCase();
        } else {
          httpMethod = method.toUpperCase();
        }

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

        hits.push({
          method: httpMethod,
          url: response.url(),
          statusCode: response.status(),
          requestBody,
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
 *   import { test, expect } from 'playswag';
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

  trackRequest: async (
    { playswagEnabled }: { playswagEnabled: boolean },
    use: (fn: <T extends APIRequestContext>(ctx: T) => T) => Promise<void>,
    testInfo: TestInfo
  ) => {
    if (!playswagEnabled) {
      await use(<T extends APIRequestContext>(ctx: T) => ctx);
      return;
    }

    const hits: EndpointHit[] = [];
    await use(<T extends APIRequestContext>(ctx: T) => buildTrackedRequest(ctx, hits, testInfo));

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
