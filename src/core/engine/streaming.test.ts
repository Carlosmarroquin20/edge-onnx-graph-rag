import { describe, expect, it } from "vitest";

import { createPushPullStream } from "./streaming.js";

describe("createPushPullStream", () => {
  it("buffers values pushed before consumption and yields them in order", async () => {
    const stream = createPushPullStream<number>();
    stream.push(1);
    stream.push(2);
    stream.push(3);
    stream.close();

    const collected: number[] = [];
    for await (const value of stream.iterable) {
      collected.push(value);
    }

    expect(collected).toEqual([1, 2, 3]);
  });

  it("resolves a pull issued before its value arrives", async () => {
    const stream = createPushPullStream<string>();
    const iterator = stream.iterable[Symbol.asyncIterator]();

    const pending = iterator.next();
    stream.push("a");

    await expect(pending).resolves.toEqual({ value: "a", done: false });
  });

  it("delivers to parked pulls in FIFO order", async () => {
    const stream = createPushPullStream<number>();
    const iterator = stream.iterable[Symbol.asyncIterator]();

    const first = iterator.next();
    const second = iterator.next();
    stream.push(10);
    stream.push(20);

    await expect(first).resolves.toEqual({ value: 10, done: false });
    await expect(second).resolves.toEqual({ value: 20, done: false });
  });

  it("completes pending and subsequent pulls on close", async () => {
    const stream = createPushPullStream<number>();
    const iterator = stream.iterable[Symbol.asyncIterator]();

    const pending = iterator.next();
    stream.close();

    await expect(pending).resolves.toEqual({ value: undefined, done: true });
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });

  it("rejects a pending pull on failure", async () => {
    const stream = createPushPullStream<number>();
    const iterator = stream.iterable[Symbol.asyncIterator]();

    const pending = iterator.next();
    stream.fail(new Error("boom"));

    await expect(pending).rejects.toThrow("boom");
  });

  it("rejects a pull issued after failure", async () => {
    const stream = createPushPullStream<number>();
    stream.fail(new Error("late"));

    const iterator = stream.iterable[Symbol.asyncIterator]();
    await expect(iterator.next()).rejects.toThrow("late");
  });

  it("drains buffered values before surfacing a failure", async () => {
    const stream = createPushPullStream<number>();
    stream.push(1);
    stream.fail(new Error("after"));

    const iterator = stream.iterable[Symbol.asyncIterator]();
    await expect(iterator.next()).resolves.toEqual({ value: 1, done: false });
    await expect(iterator.next()).rejects.toThrow("after");
  });

  it("ignores values pushed after close", async () => {
    const stream = createPushPullStream<number>();
    stream.push(1);
    stream.close();
    stream.push(2);

    const collected: number[] = [];
    for await (const value of stream.iterable) {
      collected.push(value);
    }

    expect(collected).toEqual([1]);
  });

  it("closes the stream when the consumer abandons the loop (return)", async () => {
    const stream = createPushPullStream<number>();
    stream.push(1);
    const iterator = stream.iterable[Symbol.asyncIterator]();

    await iterator.next();
    const ended = await iterator.return?.();
    expect(ended).toEqual({ value: undefined, done: true });

    // Producer is released: further pushes are ignored and pulls complete.
    stream.push(2);
    await expect(iterator.next()).resolves.toEqual({ value: undefined, done: true });
  });
});
