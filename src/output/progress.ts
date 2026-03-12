const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_INTERVAL_MS = 80;

const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const GREEN = '\x1b[32m';
const CYAN  = '\x1b[36m';

function isColorEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined) return false;
  if (process.env['FORCE_COLOR'] !== undefined) return true;
  return process.stdout.isTTY === true || process.stderr.isTTY === true;
}

function isInteractive(): boolean {
  return (
    process.stdout.isTTY === true &&
    !process.env['CI'] &&
    !process.env['NO_COLOR']
  );
}

/** Styled spinner line — mirrors the layout of `log.info` (cyan tag + icon + message). */
function progressLine(frame: string, message: string): string {
  if (!isColorEnabled()) return `[playswag] ${frame}  ${message}`;
  return `${CYAN}[playswag]${RESET}${DIM} ${frame}  ${RESET}${message}`;
}

/** Done line — identical layout to `log.info` (cyan tag + green ✓). */
function doneLine(message: string): string {
  if (!isColorEnabled()) return `[playswag] ✓  ${message}\n`;
  return `${CYAN}[playswag]${RESET}${GREEN} ✓  ${RESET}${message}\n`;
}

/**
 * Show a progress indicator while coverage is being calculated.
 * Returns a `stop()` function that clears the spinner and writes a final message.
 *
 * On non-TTY / CI environments emits plain lines instead of ANSI escape sequences.
 */
export function startProgress(message: string): (doneMessage?: string) => void {
  if (!isInteractive()) {
    process.stdout.write(progressLine('…', message) + '\n');
    return (doneMessage?: string) => {
      if (doneMessage) process.stdout.write(doneLine(doneMessage));
    };
  }

  let frame = 0;
  const timer = setInterval(() => {
    const spinner = SPINNER_FRAMES[frame % SPINNER_FRAMES.length] ?? '⠋';
    process.stdout.write(`\r${progressLine(spinner, message)}`);
    frame++;
  }, SPINNER_INTERVAL_MS);

  return (doneMessage?: string) => {
    clearInterval(timer);
    if (doneMessage) {
      // Clear the spinner line, then print the final message on a fresh line.
      process.stdout.write(`\r\x1b[K${doneLine(doneMessage)}`);
    } else {
      // Just clear the spinner line; caller will print its own output.
      process.stdout.write('\r\x1b[K');
    }
  };
}
