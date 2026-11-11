import { describe, expect, it } from "vitest";
import { exchange } from "../src/http.js";

const noSleep = async (): Promise<void> => {};

function fakeFetch(steps: Array<number | Error>): { fn: typeof fetch; calls: () => number } {
  let i = 0;
  const fn = (async () => {
    const step = steps[Math.min(i, steps.length - 1)];
    i++;
    if (step instanceof Error) throw step;
    return new Response(`body ${step}`, { status: step });
  }) as typeof fetch;
  return { fn, calls: () => i };
}

describe("exchange", () => {
  it("retries a server error and returns the later success", async () => {
    const f = fakeFetch([503, 200]);
    const res = await exchange("https://example.invalid/", {}, f.fn, noSleep);
    expect(res).toEqual({ status: 200, ok: true, text: "body 200" });
    expect(f.calls()).toBe(2);
  });

  it("returns a client error without retrying", async () => {
    const f = fakeFetch([403]);
    const res = await exchange("https://example.invalid/", {}, f.fn, noSleep);
    expect(res.status).toBe(403);
    expect(f.calls()).toBe(1);
  });

  it("gives up after the retries on a network failure", async () => {
    const f = fakeFetch([new Error("socket hang up")]);
    await expect(exchange("https://example.invalid/", {}, f.fn, noSleep)).rejects.toThrow(
      "request failed: socket hang up",
    );
    expect(f.calls()).toBe(3);
  });
});
