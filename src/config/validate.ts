import type { PlayswagConfig } from '../types.js';
import { log } from '../log.js';
import {
  assertRemoteSpecHostsRequired,
  isRemoteSpecSource,
} from '../utils/spec-security.js';

const VALID_FORMATS = new Set(['console', 'json', 'html', 'badge', 'junit', 'markdown']);

export function validatePlayswagConfig(config: PlayswagConfig): void {
  if (config.outputFormats) {
    for (const fmt of config.outputFormats) {
      if (!VALID_FORMATS.has(fmt)) {
        log.warn(`Unknown output format "${fmt}" — valid values: ${[...VALID_FORMATS].join(', ')}`);
      }
    }
  }

  if (config.schemaDepth != null && (!Number.isInteger(config.schemaDepth) || config.schemaDepth < 1 || config.schemaDepth > 10)) {
    log.warn(`schemaDepth ${config.schemaDepth} is invalid — using an integer from 1 to 10, or the default for non-finite values`);
  }

  if (config.maxResponseBodyBytes != null && config.maxResponseBodyBytes < 0) {
    log.warn('maxResponseBodyBytes must be >= 0');
  }

  if (config.specs) {
    const sources = Array.isArray(config.specs) ? config.specs : [config.specs];
    const remote = sources.filter((s) => isRemoteSpecSource(s));
    if (remote.length > 0) {
      try {
        assertRemoteSpecHostsRequired(sources, config);
      } catch (err) {
        log.error((err as Error).message);
      }
    }
  }
}

export function resolveFailOnSpecError(config: PlayswagConfig): boolean {
  if (config.failOnSpecError !== undefined) return config.failOnSpecError;
  return process.env['CI'] === 'true';
}
