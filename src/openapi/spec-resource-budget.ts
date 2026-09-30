/** Internal limits shared by every HTTP document in one parser invocation. */
export interface SpecResourceLimits {
  maxDocuments: number;
  maxDecodedBytes: number;
  concurrency: number;
}
export const DEFAULT_SPEC_RESOURCE_LIMITS: Readonly<SpecResourceLimits> = {
  maxDocuments: 1024,
  maxDecodedBytes: 64 * 1024 * 1024,
  concurrency: 8,
};

export interface SpecReadHooks {
  signal: AbortSignal;
  onDecodedBytes: (bytes: number) => void;
}
type ReadDocument = (url: string, hooks: SpecReadHooks) => Promise<Buffer>;

/** A bounded queue with one fail-closed budget and cancellation signal per parse. */
export function createBudgetedSpecReader(
  readDocument: ReadDocument,
  limits: Readonly<SpecResourceLimits> = DEFAULT_SPEC_RESOURCE_LIMITS,
): (url: string) => Promise<Buffer> {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`Invalid internal spec resource limit: ${name}`);
  }
  const controller = new AbortController();
  const pending: Array<{ url: string; resolve: (body: Buffer) => void; reject: (error: Error) => void }> = [];
  let documents = 0;
  let decodedBytes = 0;
  let active = 0;
  let failure: Error | undefined;

  function fail(reason: unknown): Error {
    if (!failure) {
      failure = reason instanceof Error ? reason : new Error(String(reason));
      controller.abort(failure);
      for (const request of pending.splice(0)) request.reject(failure);
    }
    return failure;
  }
  const hooks: SpecReadHooks = {
    signal: controller.signal,
    onDecodedBytes(bytes) {
      if (failure) throw failure;
      decodedBytes += bytes;
      if (decodedBytes > limits.maxDecodedBytes) {
        throw fail(new Error(`OpenAPI HTTP references exceed aggregate decoded byte limit (${limits.maxDecodedBytes} bytes per parse)`));
      }
    },
  };
  function drain(): void {
    while (!failure && active < limits.concurrency && pending.length) {
      const request = pending.shift()!;
      active++;
      void Promise.resolve().then(() => {
        hooks.signal.throwIfAborted();
        return readDocument(request.url, hooks);
      }).then(request.resolve, (error: unknown) => request.reject(fail(error))).finally(() => {
        active--;
        drain();
      });
    }
  }
  return (url) => {
    if (failure) return Promise.reject(failure);
    if (++documents > limits.maxDocuments) {
      return Promise.reject(fail(new Error(`OpenAPI HTTP references exceed document limit (${limits.maxDocuments} documents per parse)`)));
    }
    return new Promise<Buffer>((resolve, reject) => {
      pending.push({ url, resolve, reject });
      drain();
    });
  };
}
