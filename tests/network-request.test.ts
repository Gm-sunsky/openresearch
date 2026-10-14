import dns from "node:dns/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeNetworkError, requestWithRetry } from "../electron/main/network-request";
import { fetchPublicUrl } from "../electron/main/outbound-url";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const text = async (response: Response) => response.text();

describe("bounded source requests", () => {
  it("retries a header timeout with a fresh signal and consumes the successful body", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signals.push(init!.signal!);
      if (signals.length === 1) return new Promise(() => {});
      return new Response("complete");
    });
    const result = requestWithRetry("https://example.com", {}, { timeoutMs: 20, fetchImpl }, text);
    await vi.advanceTimersByTimeAsync(20);
    await expect(result).resolves.toBe("complete");
    expect(signals).toHaveLength(2);
    expect(signals[0]).not.toBe(signals[1]);
    expect(signals[0].aborted).toBe(true);
  });

  it("covers stalled response bodies and stops at the configured attempt bound", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => new Response(new ReadableStream({ start() {} })));
    const result = requestWithRetry("https://example.com", {}, { timeoutMs: 10, fetchImpl }, text);
    const failed = expect(result).rejects.toThrow("请求超时（1 秒），请稍后重试");
    await vi.advanceTimersByTimeAsync(20);
    await failed;
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("retries temporary HTTP failures but never retries permanent statuses", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response("busy", { status: 503 })).mockResolvedValueOnce(new Response("ok"));
    await expect(requestWithRetry("https://example.com", {}, { fetchImpl }, text)).resolves.toBe("ok");
    const forbidden = vi.fn<typeof fetch>().mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(requestWithRetry("https://example.com", {}, { fetchImpl: forbidden }, async (response) => response.status)).resolves.toBe(403);
    expect(forbidden).toHaveBeenCalledTimes(1);
  });

  it("does not retry caller cancellation or non-idempotent requests", async () => {
    const abort = new AbortController();
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () => { abort.abort(new Error("user cancelled")); throw abort.signal.reason; });
    await expect(requestWithRetry("https://example.com", { signal: abort.signal }, { fetchImpl }, text)).rejects.toThrow("user cancelled");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const post = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    await expect(requestWithRetry("https://example.com", { method: "POST" }, { fetchImpl: post }, text)).rejects.toThrow("网络连接暂时失败");
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("preserves public URL redirect checks without retrying safety rejection", async () => {
    vi.spyOn(dns, "lookup").mockResolvedValue([{ address: "93.184.216.34", family: 4 }] as never);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    await expect(requestWithRetry("https://example.com", {}, {
      fetchImpl: (url, init) => fetchPublicUrl(String(url), init ?? {}, fetchImpl),
    }, text)).rejects.toThrow("私有网络");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("normalizes raw abort messages while retaining meaningful HTTP diagnostics", () => {
    expect(normalizeNetworkError(new DOMException("The operation was aborted.", "AbortError"))).toBe("请求超时，请稍后重试");
    expect(normalizeNetworkError(new Error("HTTP 403"))).toBe("HTTP 403");
  });
});

it("retries Chromium abort text even when no AbortError name is provided", async () => {
  const fetchImpl = vi.fn<typeof fetch>().mockRejectedValueOnce(new Error("The operation was aborted."))
    .mockResolvedValueOnce(new Response("recovered"));
  await expect(requestWithRetry("https://example.com", {}, { fetchImpl }, text)).resolves.toBe("recovered");
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});
