import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startProgress } from '../../src/output/progress.js';

describe('startProgress', () => {
  let originalCI: string | undefined;
  let originalNoColor: string | undefined;
  let originalIsTTY: boolean | undefined;
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalCI = process.env['CI'];
    originalNoColor = process.env['NO_COLOR'];
    originalIsTTY = process.stdout.isTTY;

    writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    if (originalCI !== undefined) process.env['CI'] = originalCI;
    else delete process.env['CI'];
    if (originalNoColor !== undefined) process.env['NO_COLOR'] = originalNoColor;
    else delete process.env['NO_COLOR'];
    Object.defineProperty(process.stdout, 'isTTY', { value: originalIsTTY, configurable: true });

    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function setNonInteractive() {
    delete process.env['CI'];
    delete process.env['NO_COLOR'];
    // Most test runners are non-TTY
    Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
  }

  function setInteractive() {
    delete process.env['CI'];
    delete process.env['NO_COLOR'];
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  }

  describe('non-interactive (CI / non-TTY)', () => {
    it('prints a plain start message when CI env is set', () => {
      setNonInteractive();
      process.env['CI'] = 'true';

      const stop = startProgress('Calculating coverage…');
      stop();

      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('[playswag]'));
      expect(writeSpy).toHaveBeenCalledWith(expect.stringContaining('Calculating coverage'));
    });

    it('prints a plain start message when stdout is not a TTY', () => {
      setNonInteractive();

      const stop = startProgress('Calculating coverage…');
      stop();

      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((s) => s.includes('Calculating coverage'))).toBe(true);
    });

    it('prints a plain done message when stop() is called', () => {
      setNonInteractive();

      const stop = startProgress('Calculating coverage…');
      stop('Coverage complete.');

      const calls = writeSpy.mock.calls.map((c) => String(c[0]));
      expect(calls.some((s) => s.includes('Coverage complete.') && s.includes('✓'))).toBe(true);
    });

    it('prints nothing when stop() is called with no argument', () => {
      setNonInteractive();

      const stop = startProgress('Calculating…');
      writeSpy.mockClear();
      stop();

      // silent stop: no additional writes in non-interactive mode
      expect(writeSpy).not.toHaveBeenCalled();
    });

    it('does not write ANSI escape sequences in non-interactive mode', () => {
      setNonInteractive();
      process.env['CI'] = 'true';

      const stop = startProgress('Calculating…');
      stop();

      const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).not.toContain('\x1b[');
    });

    it('prints a plain message when NO_COLOR is set', () => {
      setInteractive();
      process.env['NO_COLOR'] = '1';

      const stop = startProgress('Calculating…');
      stop();

      const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).not.toContain('\x1b[');
      expect(allOutput).toContain('[playswag]');
    });
  });

  describe('interactive (TTY, no CI)', () => {
    it('clears the spinner line with ANSI escape on stop()', () => {
      setInteractive();
      vi.useFakeTimers();

      const stop = startProgress('Calculating…');

      // Advance time to trigger at least one spinner tick
      vi.advanceTimersByTime(200);

      stop('Coverage complete.');

      const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      // Should use carriage return + erase to clear the spinner line
      expect(allOutput).toContain('\x1b[K');
      expect(allOutput).toContain('Coverage complete.');
    });

    it('spinner writes include the message text', () => {
      setInteractive();
      vi.useFakeTimers();

      const stop = startProgress('Doing work');
      vi.advanceTimersByTime(200);
      stop();

      const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(allOutput).toContain('Doing work');
    });
  });
});
