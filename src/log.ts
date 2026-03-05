/**
 * Minimal coloured logging helpers for [playswag] console output.
 *
 * Uses ANSI escape codes directly (synchronous, zero extra dependencies) and
 * respects the NO_COLOR / FORCE_COLOR environment conventions as well as
 * whether the process has an interactive terminal attached.
 */

const RESET = '\x1b[0m';
const BOLD  = '\x1b[1m';
const DIM   = '\x1b[2m';
const RED    = '\x1b[31m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN   = '\x1b[36m';

function isColorEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined) return false;
  if (process.env['FORCE_COLOR'] !== undefined) return true;
  return process.stdout.isTTY === true || process.stderr.isTTY === true;
}

function ansi(code: string, text: string): string {
  return isColorEnabled() ? `${code}${text}${RESET}` : text;
}

const TAG = '[playswag]';

/**
 * Print a success / informational message to stdout.
 *
 * @example
 * log.info(`Coverage report written to ${path}`);
 * // [playswag] ✓  Coverage report written to ./playswag-coverage/coverage.json
 */
function info(message: string): void {
  const tag  = ansi(CYAN, TAG);
  const icon = ansi(GREEN, ' ✓  ');
  console.log(`${tag}${icon}${message}`);
}

/**
 * Print a warning to stderr.
 *
 * An optional `hint` is printed on a second, dimmed line and should suggest a
 * concrete fix (e.g. which config option to set).
 *
 * @example
 * log.warn('No specs configured — skipping.', 'Set the `specs` option in your reporter config.');
 */
function warn(message: string, hint?: string): void {
  const tag  = ansi(YELLOW + BOLD, TAG);
  const icon = ansi(YELLOW, ' ⚠  ');
  const msg  = ansi(YELLOW, message);
  const suffix = hint ? `\n           ${ansi(DIM, hint)}` : '';
  console.warn(`${tag}${icon}${msg}${suffix}`);
}

/**
 * Print an error to stderr.
 *
 * @example
 * log.error(`Could not parse spec(s): ${err.message}`);
 */
function error(message: string): void {
  const tag  = ansi(RED + BOLD, TAG);
  const icon = ansi(RED, ' ✖  ');
  const msg  = ansi(RED, message);
  console.error(`${tag}${icon}${msg}`);
}

export const log = { info, warn, error };
