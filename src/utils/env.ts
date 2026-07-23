const TRUTHY = new Set(['1', 'true', 'yes', 'on']);

/**
 * When true, playswag skips hit tracking (fixture) and coverage reporting (reporter).
 * Set `PLAYSWAG_DISABLED=1` locally to run Playwright without changing config.
 *
 * @example
 * PLAYSWAG_DISABLED=1 npx playwright test
 */
export function isPlayswagDisabled(): boolean {
  const raw = process.env['PLAYSWAG_DISABLED'];
  if (raw === undefined || raw === '') return false;
  return TRUTHY.has(raw.trim().toLowerCase());
}
