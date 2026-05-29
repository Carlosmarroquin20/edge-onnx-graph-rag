/**
 * Push-to-pull stream bridge.
 *
 * Transformers.js emits decoded text through synchronous callbacks, whereas the
 * engine contract exposes generation as an `AsyncIterable`. This adapter buffers
 * pushed values and hands them to a pulling consumer with O(1) hand-off, no
 * polling, and deterministic completion/failure propagation. Cancellation is
 * surfaced as a rejected iterator result.
 */

interface PendingPull<T> {
  readonly resolve: (result: IteratorResult<T>) => void;
  readonly reject: (reason: unknown) => void;
}

export interface PushPullStream<T> {
  /** Pull side handed to the generation consumer. */
  readonly iterable: AsyncIterable<T>;
  /** Enqueue a value; ignored once the stream is closed or failed. */
  push(value: T): void;
  /** Signal normal completion; pending and future pulls resolve as done. */
  close(): void;
  /** Signal abnormal termination; the next pull rejects with `reason`. */
  fail(reason: unknown): void;
}

/**
 * Creates a single-producer/single-consumer async stream. Values pushed before
 * a pull are buffered in arrival order; pulls issued before a push park until a
 * value, completion, or failure arrives.
 */
export function createPushPullStream<T>(): PushPullStream<T> {
  const buffered: T[] = [];
  const waiting: PendingPull<T>[] = [];
  let isClosed = false;
  let failure: { reason: unknown } | null = null;

  function push(value: T): void {
    if (isClosed || failure !== null) {
      return;
    }
    const pull = waiting.shift();
    if (pull !== undefined) {
      pull.resolve({ value, done: false });
    } else {
      buffered.push(value);
    }
  }

  function close(): void {
    if (isClosed || failure !== null) {
      return;
    }
    isClosed = true;
    for (const pull of waiting.splice(0)) {
      pull.resolve({ value: undefined, done: true });
    }
  }

  function fail(reason: unknown): void {
    if (isClosed || failure !== null) {
      return;
    }
    failure = { reason };
    for (const pull of waiting.splice(0)) {
      pull.reject(reason);
    }
  }

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        next(): Promise<IteratorResult<T>> {
          if (buffered.length > 0) {
            // Length-guarded: shift cannot be undefined here.
            return Promise.resolve({ value: buffered.shift() as T, done: false });
          }
          if (failure !== null) {
            return Promise.reject(failure.reason);
          }
          if (isClosed) {
            return Promise.resolve({ value: undefined, done: true });
          }
          return new Promise<IteratorResult<T>>((resolve, reject) => {
            waiting.push({ resolve, reject });
          });
        },
        return(): Promise<IteratorResult<T>> {
          // Consumer abandoned the loop (e.g. `break`); release the producer.
          close();
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };

  return { iterable, push, close, fail };
}
