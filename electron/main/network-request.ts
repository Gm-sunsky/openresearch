export interface RequestRetryOptions {
  timeoutMs?: number;
  attempts?: number;
  fetchImpl?: typeof fetch;
}

export function normalizeNetworkError(error: unknown, timeoutMs?: number): string {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (name === "TimeoutError" || name === "AbortError" || /\baborted\b|aborterror|timed?\s*out|timeout/i.test(message)) {
    return `请求超时${timeoutMs ? `（${Math.ceil(timeoutMs / 1000)} 秒）` : ""}，请稍后重试`;
  }
  if (error instanceof TypeError && /fetch|network|connect|socket/i.test(message)) return "网络连接暂时失败，请检查网络后重试";
  return message || "网络请求失败，请稍后重试";
}

const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);

/** Keep the timeout active while consume reads the response body, not only until headers arrive. */
export async function requestWithRetry<T>(
  url: string,
  init: RequestInit,
  options: RequestRetryOptions,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const timeoutMs = Math.max(1, options.timeoutMs ?? 15_000);
  const method = (init.method ?? "GET").toUpperCase();
  const attempts = method === "GET" || method === "HEAD" ? Math.min(3, Math.max(1, options.attempts ?? 2)) : 1;
  const fetchImpl = options.fetchImpl ?? fetch;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    init.signal?.throwIfAborted();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onAbort = () => controller.abort(init.signal?.reason);
    init.signal?.addEventListener("abort", onAbort, { once: true });
    const cancelled = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
      timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
    });
    let response: Response | undefined;
    try {
      return await Promise.race([
        (async () => {
          response = await fetchImpl(url, { ...init, signal: controller.signal });
          controller.signal.throwIfAborted();
          if (retryableStatuses.has(response.status) && attempt < attempts - 1) {
            const error = new Error(`HTTP ${response.status}`);
            error.name = "RetryableHttpError";
            throw error;
          }
          return consume(response);
        })(),
        cancelled,
      ]);
    } catch (error) {
      // Caller cancellation is intentional and must never restart work.
      if (init.signal?.aborted) throw init.signal.reason;
      const name = error instanceof Error ? error.name : "";
      const retryable = name === "RetryableHttpError" || name === "TimeoutError" || name === "AbortError" || error instanceof TypeError
        || (error instanceof Error && /\b(?:aborted|timeout)\b|timed?\s*out/i.test(error.message));
      if (attempt === attempts - 1 || !retryable) throw new Error(normalizeNetworkError(error, timeoutMs), { cause: error });
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", onAbort);
      // Aborting also stops a body read after a failed/timed-out attempt.
      controller.abort();
      if (response?.body && !response.body.locked) void response.body.cancel().catch(() => {});
    }
  }
  throw new Error("网络请求失败");
}

