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
  try {
    const range = response.req.headers.range;
    const upstream = await request(url, {
      headers: range ? { Range: range } : {},
      signal: AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(120_000),
      ]),
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
    await pipeline(
      Readable.fromWeb(
        upstream.body as import("node:stream/web").ReadableStream,
      ),
      response,
    );
    return true;
  } catch (error) {
    if (controller.signal.aborted) return true;
    throw error;
  } finally {
    response.off("close", disconnect);
  }
}
