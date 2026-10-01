import { describe, expect, it, vi } from 'vitest';
import { createBudgetedSpecReader, type SpecReadHooks } from '../../src/openapi/spec-resource-budget.js';

function stalledReader() {
  const started: Array<{ url: string; hooks: SpecReadHooks }> = [];
  const read = vi.fn((url: string, hooks: SpecReadHooks) => new Promise<Buffer>((_resolve, reject) => {
    started.push({ url, hooks });
    hooks.signal.addEventListener('abort', () => reject(hooks.signal.reason), { once: true });
  }));
  return { started, read };
}

describe('per-parse HTTP resource budget', () => {
  it('bounds concurrent reads while allowing normal modular specs to finish', async () => {
    let active = 0;
    let peak = 0;
    const read = createBudgetedSpecReader(async (_url, hooks) => {
      peak = Math.max(peak, ++active);
      await new Promise((resolve) => setImmediate(resolve));
      hooks.onDecodedBytes(2);
      active--;
      return Buffer.from('{}');
    }, { maxDocuments: 5, maxDecodedBytes: 10, concurrency: 2 });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => read(`https://spec.test/${i}`)));
    expect(results).toHaveLength(5);
    expect(peak).toBe(2);
  });

  it('aborts active documents and rejects queued and future readers on document overflow', async () => {
    const source = stalledReader();
    const read = createBudgetedSpecReader(source.read, { maxDocuments: 2, maxDecodedBytes: 100, concurrency: 1 });
    const first = read('https://spec.test/1');
    await Promise.resolve();
    const second = read('https://spec.test/2');
    const third = read('https://spec.test/3');
    const results = await Promise.allSettled([first, second, third]);
    expect(results.every((result) => result.status === 'rejected' && /document limit/.test(String(result.reason)))).toBe(true);
    expect(source.read).toHaveBeenCalledTimes(1);
    expect(source.started[0]!.hooks.signal.aborted).toBe(true);
    await expect(read('https://spec.test/4')).rejects.toThrow(/document limit/);
  });

  it('shares decoded byte accounting across in-flight documents and stops the queue immediately', async () => {
    const source = stalledReader();
    const read = createBudgetedSpecReader(source.read, { maxDocuments: 10, maxDecodedBytes: 5, concurrency: 2 });
    const results = Promise.allSettled([read('https://spec.test/1'), read('https://spec.test/2'), read('https://spec.test/3')]);
    await Promise.resolve();
    source.started[0]!.hooks.onDecodedBytes(2);
    expect(() => source.started[1]!.hooks.onDecodedBytes(4)).toThrow(/aggregate decoded byte limit/);
    expect((await results).every((result) => result.status === 'rejected')).toBe(true);
    expect(source.read).toHaveBeenCalledTimes(2);
    await expect(read('https://spec.test/later')).rejects.toThrow(/aggregate decoded byte limit/);
  });

  it('does not share budgets between parser invocations', async () => {
    const limits = { maxDocuments: 1, maxDecodedBytes: 2, concurrency: 1 };
    const source = async (_url: string, hooks: SpecReadHooks) => { hooks.onDecodedBytes(2); return Buffer.from('{}'); };
    const first = createBudgetedSpecReader(source, limits);
    await first('https://spec.test/1');
    await expect(first('https://spec.test/2')).rejects.toThrow(/document limit/);
    await expect(createBudgetedSpecReader(source, limits)('https://spec.test/3')).resolves.toEqual(Buffer.from('{}'));
  });
});
