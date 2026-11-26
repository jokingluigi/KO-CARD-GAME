import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { Response } from "express";

/** Keep the private upstream URL on the server; forward bytes as soon as they arrive. */
export async function streamAudio(
  url: string,
  response: Response,
  request = fetch,
): Promise<boolean> {
  const controller = new AbortController();
  const disconnect = () => controller.abort();
  response.once("close", disconnect);
  // 2026-11-26: AbortSignal.timeout은 전송이 끝난 뒤에도 살아 있다가 2분 뒤 터졌고,
  // 아무도 받지 않는 오류가 되어 서버 전체가 꺼졌다 (4~5분마다 재시작). → 직접 만든 타이머를 끝나면 끈다.
  const timer = setTimeout(() => controller.abort(new DOMException("Audio stream timed out", "TimeoutError")), 120_000);
  let body: Readable | null = null;
  try {
    const range = response.req.headers.range;
    const upstream = await request(url, {
      headers: range ? { Range: range } : {},
      signal: controller.signal,
    });
    if (upstream.status === 404) {
      await upstream.body?.cancel();
      return false;
    }
    if (
      upstream.status !== 200 &&
      upstream.status !== 206 &&
      upstream.status !== 416
    ) {
      await upstream.body?.cancel();
      throw new Error(`Audio storage returned status ${upstream.status}`);
    }
    response.status(upstream.status);
    for (const name of [
      "content-type",
      "content-length",
      "content-range",
      "accept-ranges",
      "etag",
      "last-modified",
    ]) {
      const value = upstream.headers.get(name);
      if (value) response.setHeader(name, value);
    }
    response.setHeader(
      "Cache-Control",
      // 업로드 파일 이름은 매번 고유하게 만들어져 내용이 바뀌지 않는다 → 브라우저가 오래 보관해도 안전
      upstream.status === 416 ? "no-store" : "public, max-age=31536000, immutable",
    );
    if (!upstream.body) {
      response.end();
      return true;
    }
    body = Readable.fromWeb(
      upstream.body as import("node:stream/web").ReadableStream,
    );
    // 끊긴 뒤 늦게 오는 오류도 받아 둔다 (받는 곳 없는 오류 = 서버 꺼짐)
    body.on("error", () => undefined);
    await pipeline(body, response);
    return true;
  } catch (error) {
    if (controller.signal.aborted || response.destroyed || response.writableEnded) return true;
    throw error;
  } finally {
    clearTimeout(timer);
    response.off("close", disconnect);
    if (body && !body.destroyed) body.destroy();
  }
}
