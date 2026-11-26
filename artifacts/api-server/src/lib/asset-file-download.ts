import { createWriteStream } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export type DownloadedAssetFile = { bytes: number; contentType: string | null };

export class AssetFileTooLargeError extends Error {
  constructor() {
    super("Asset exceeds the disk cache file limit");
    this.name = "AssetFileTooLargeError";
  }
}

/** target is a private, unique staging path; never publish a partial download. */
export async function saveAssetStream(
  source: Readable,
  target: string,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<number> {
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, done) {
      bytes += chunk.length;
      done(bytes > maxBytes ? new AssetFileTooLargeError() : null, chunk);
    },
  });
  // A late upstream error must not escape after a canceled/failed pipeline.
  source.on("error", () => undefined);
  try {
    await pipeline(source, limit, createWriteStream(target), { signal });
    return bytes;
  } catch (error) {
    await rm(target, { force: true });
    throw error;
  }
}

/** Fetch private storage directly to disk, without blob()/arrayBuffer(). */
export async function downloadAssetFile(
  url: string,
  target: string,
  maxBytes: number,
  request = fetch,
  timeoutMs = 120_000,
): Promise<DownloadedAssetFile | null> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new DOMException("Asset download timed out", "TimeoutError")),
    timeoutMs,
  );
  timer.unref();
  let source: Readable | undefined;
  try {
    const response = await request(url, { signal: controller.signal });
    if (response.status === 404) {
      await response.body?.cancel();
      return null;
    }
    // The cache holds complete originals; a partial/error response is not one.
    if (response.status !== 200) {
      await response.body?.cancel();
      throw new Error(`Asset storage returned status ${response.status}`);
    }
    // fetch() decodes content-encoding; an encoded Content-Length describes
    // wire bytes, not the decoded bytes written below.
    const encoding = response.headers.get("content-encoding");
    const length = !encoding || encoding === "identity" ? response.headers.get("content-length") : null;
    const expected = length === null ? undefined : Number(length);
    if (expected !== undefined && Number.isFinite(expected) && expected > maxBytes) {
      await response.body?.cancel();
      throw new AssetFileTooLargeError();
    }
    if (!response.body) throw new Error("Asset storage returned no body");
    source = Readable.fromWeb(response.body as import("node:stream/web").ReadableStream);
    const bytes = await saveAssetStream(source, target, maxBytes, controller.signal);
    if (expected !== undefined && Number.isFinite(expected) && expected !== bytes) {
      await rm(target, { force: true });
      throw new Error("Asset storage returned an incomplete file");
    }
    return { bytes, contentType: response.headers.get("content-type") };
  } finally {
    clearTimeout(timer);
    source?.destroy();
  }
}
