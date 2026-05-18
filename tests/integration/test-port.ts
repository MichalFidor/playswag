/**
 * Integration test port helper.
 * Set PLAYSWAG_TEST_PORT when running multiple suites in parallel locally.
 */
export function getIntegrationTestPort(): number {
  const fromEnv = process.env['PLAYSWAG_TEST_PORT'];
  if (fromEnv) return Number(fromEnv);
  return 3456;
}
