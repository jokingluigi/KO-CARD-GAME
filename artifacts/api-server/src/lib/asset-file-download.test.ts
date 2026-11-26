import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { AssetFileTooLargeError, downloadAssetFile } from "./asset-file-download";

async function fixture(work: (file: string) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), "ko-asset-file-test-"));
  try { await work(path.join(dir, "staging.tmp")); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

test("writes incoming audio to disk before the download finishes, without buffering methods", async () => fixture(async (file) => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) { source = c; c.enqueue(Buffer.from("first")); } });
  const response = new Response(body, { headers: { "Content-Type": "audio/mpeg", "Content-Length": "10" } });
  Object.defineProperties(response, {
    blob: { value: async () => { throw Error("must not buffer a blob"); } },
    arrayBuffer: { value: async () => { throw Error("must not buffer an arrayBuffer"); } },
  });
  let finished = false;
  const pending = downloadAssetFile("https://private.invalid/song", file, 100, async () => response)
    .finally(() => { finished = true; });
  try {
    let observed = "";
    for (let i = 0; i < 100; i++) {
      try { observed = await readFile(file, "utf8"); } catch { /* File opens asynchronously. */ }
      if (observed === "first") break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.equal(observed, "first");
    assert.equal(finished, false);
    source.enqueue(Buffer.from("-last")); source.close();
    assert.deepEqual(await pending, { bytes: 10, contentType: "audio/mpeg" });
    assert.equal(await readFile(file, "utf8"), "first-last");
  } catch (error) {
    source.error(error); await pending.catch(() => undefined); throw error;
  }
}));

test("missing assets return null, and partial/error responses never enter the cache", async () => fixture(async (file) => {
  assert.equal(await downloadAssetFile("https://private.invalid/song", file, 100, async () => new Response(null, { status: 404 })), null);
  for (const status of [206, 403, 503]) {
    await assert.rejects(downloadAssetFile("https://private.invalid/song", file, 100, async () => new Response("bad", { status })), new RegExp(`status ${status}`));
  }
  await assert.rejects(stat(file), { code: "ENOENT" });
}));

test("rejects declared oversize files before writing and cancels their body", async () => fixture(async (file) => {
  let canceled = false;
  const body = new ReadableStream({ cancel() { canceled = true; } });
  await assert.rejects(downloadAssetFile("https://private.invalid/song", file, 4, async () => new Response(body, { headers: { "Content-Length": "9" } })), AssetFileTooLargeError);
  assert.equal(canceled, true);
  await assert.rejects(stat(file), { code: "ENOENT" });
}));

test("counts streamed bytes when length is absent and removes oversize partial files", async () => fixture(async (file) => {
  const body = new ReadableStream({ start(c) { c.enqueue(Buffer.alloc(6)); c.enqueue(Buffer.alloc(6)); c.close(); } });
  await assert.rejects(downloadAssetFile("https://private.invalid/song", file, 8, async () => new Response(body)), AssetFileTooLargeError);
  await assert.rejects(stat(file), { code: "ENOENT" });
}));

test("truncated content is removed instead of becoming a valid disk entry", async () => fixture(async (file) => {
  await assert.rejects(downloadAssetFile("https://private.invalid/song", file, 100, async () => new Response("abc", { headers: { "Content-Length": "7" } })), /incomplete file/);
  await assert.rejects(stat(file), { code: "ENOENT" });
}));

test("decoded content is not compared with compressed wire Content-Length", async () => fixture(async (file) => {
  const response = new Response("decoded-audio", { headers: { "Content-Length": "3", "Content-Encoding": "gzip" } });
  const saved = await downloadAssetFile("https://private.invalid/song", file, 100, async () => response);
  assert.equal(saved?.bytes, 13);
  assert.equal(await readFile(file, "utf8"), "decoded-audio");
}));

test("timeout aborts the source, removes partial data and has no unhandled stream error", async () => fixture(async (file) => {
  let signal!: AbortSignal;
  const keepAlive = setTimeout(() => undefined, 1000);
  try {
    await assert.rejects(downloadAssetFile("https://private.invalid/song", file, 100, async (_url, init) => {
      signal = init!.signal as AbortSignal;
      return new Response(new ReadableStream({ start(c) {
        c.enqueue(Buffer.from("part"));
        signal.addEventListener("abort", () => c.error(signal.reason), { once: true });
      } }));
    }, 20), /abort|timed out/i);
    assert.equal(signal.aborted, true);
    await assert.rejects(stat(file), { code: "ENOENT" });
    await new Promise((resolve) => setTimeout(resolve, 25));
  } finally { clearTimeout(keepAlive); }
}));

test("finishing a download clears its timer instead of aborting a completed stream later", async () => fixture(async (file) => {
  let signal!: AbortSignal;
  await downloadAssetFile("https://private.invalid/song", file, 100, async (_url, init) => {
    signal = init!.signal as AbortSignal; return new Response("done");
  }, 30);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(signal.aborted, false);
}));
