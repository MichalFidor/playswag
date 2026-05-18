import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log } from '../../src/log.js';

describe('log', () => {
  let originalNoColor: string | undefined;

  beforeEach(() => {
    originalNoColor = process.env['NO_COLOR'];
    delete process.env['NO_COLOR'];
  });

  afterEach(() => {
    if (originalNoColor !== undefined) process.env['NO_COLOR'] = originalNoColor;
    else delete process.env['NO_COLOR'];
    vi.restoreAllMocks();
  });

  it('info writes to console.log', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('hello');
    expect(spy).toHaveBeenCalled();
    const msg = String(spy.mock.calls[0]?.[0]);
    expect(msg).toContain('[playswag]');
    expect(msg).toContain('hello');
  });

  it('warn writes to console.warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    log.warn('careful');
    expect(spy).toHaveBeenCalled();
  });

  it('error writes to console.error', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    log.error('boom');
    expect(spy).toHaveBeenCalled();
  });

  it('omits ANSI when NO_COLOR is set', () => {
    process.env['NO_COLOR'] = '1';
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    log.info('plain');
    const msg = String(spy.mock.calls[0]?.[0]);
    expect(msg).not.toContain('\x1b[');
  });
});
