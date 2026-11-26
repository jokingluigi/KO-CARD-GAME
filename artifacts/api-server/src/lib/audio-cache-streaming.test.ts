import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { deliverCachedAudio, resetAudioCache } from "./audio-cache";
import { AssetFileTooLargeError } from "./asset-file-download";

test("streamed audio cache deduplicates fills, retains bytes/Range and avoids the buffered adapter", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ko-audio-stage-test-"));
  await resetAudioCache(dir);
  const bytes = Buffer.from(Array.from({ length: 10_000 }, (_, i) => i % 251));
  let stages = 0, buffered = 0;
  const app = express();
  app.get("/song", async (_req, res, next) => {
    try {
      const result = await deliverCachedAudio("/objects/uploads/game-bgm/test.mp3", async () => {
        buffered++; throw Error("full-file buffering must not run");
      }, res, async (file, limit) => {
        stages++; assert.ok(limit >= bytes.length);
        await new Promise((r) => setTimeout(r, 15));
        await writeFile(file, bytes);
        return { bytes: bytes.length, contentType: "audio/mpeg" };
      });
      assert.equal(result, true);
    } catch (error) { next(error); }
  });
  app.use(((error, _request, response, _next) => {
    response.status(error.status ?? 500).end();
  }) as import("express").ErrorRequestHandler);
  const server = app.listen(0); const port = (server.address() as { port: number }).port;
  try {
    const results = await Promise.all([fetch(`http://127.0.0.1:${port}/song`), fetch(`http://127.0.0.1:${port}/song`)]);
    for (const res of results) {
      assert.deepEqual(Buffer.from(await res.arrayBuffer()), bytes);
      assert.match(res.headers.get("cache-control")!, /immutable/);
      assert.equal(res.headers.get("content-type"), "audio/mpeg");
    }
    const partial = await fetch(`http://127.0.0.1:${port}/song`, { headers: { Range: "bytes=19-58" } });
    assert.equal(partial.status, 206);
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), bytes.subarray(19, 59));
    const invalid = await fetch(`http://127.0.0.1:${port}/song`, { headers: { Range: "bytes=20000-" } });
    assert.equal(invalid.status, 416); await invalid.arrayBuffer();
    assert.equal(stages, 1); assert.equal(buffered, 0);
    assert.equal((await readdir(dir)).filter((f) => f.endsWith(".tmp")).length, 0);
  } finally { server.close(); await resetAudioCache(); await rm(dir, { recursive: true, force: true }); }
});

test("failed staging is cleaned and retry cannot reuse a partial song", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ko-audio-retry-test-"));
  await resetAudioCache(dir);
  const response = { setHeader() {}, sendFile(_file: string, _options: unknown, done: (error?: Error) => void) { done(); } };
  let buffered = 0;
  const download = async () => { buffered++; throw Error("must stream"); };
  try {
    await assert.rejects(deliverCachedAudio("/song.mp3", download, response as never, async (file) => {
      await writeFile(file, "broken"); throw Error("upstream failed");
    }), /upstream failed/);
    assert.deepEqual(await readdir(dir), []);
    assert.equal(await deliverCachedAudio("/song.mp3", download, response as never, async (file) => {
      await writeFile(file, "complete"); return { bytes: 8, contentType: "audio/mpeg" };
    }), true);
    assert.equal(buffered, 0);
  } finally { await resetAudioCache(); await rm(dir, { recursive: true, force: true }); }
});

test("missing and oversized streamed audio preserve 404 and normal streaming fallback", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ko-audio-miss-test-"));
  await resetAudioCache(dir);
  let headers = 0;
  const response = { setHeader() { headers++; } };
  try {
    assert.equal(await deliverCachedAudio("/missing.mp3", async () => { throw Error("must stream"); }, response as never, async () => null), false);
    assert.equal(await deliverCachedAudio("/large.mp3", async () => { throw Error("must stream"); }, response as never, async () => { throw new AssetFileTooLargeError(); }), null);
    assert.equal(headers, 0);
    assert.deepEqual(await readdir(dir), []);
  } finally { await resetAudioCache(); await rm(dir, { recursive: true, force: true }); }
});

test("production storage route stages a private signed source and never downloads an audio blob", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "ko-audio-route-test-"));
  await resetAudioCache(dir);
  const keys = ["STORAGE_PROVIDER", "SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_STORAGE_BUCKET"];
  const saved = keys.map((k) => process.env[k]); const original = globalThis.fetch;
  const calls: string[] = []; const bytes = Buffer.from("private-song-data");
  let server: ReturnType<ReturnType<typeof express>["listen"]> | undefined;
  try {
    process.env.STORAGE_PROVIDER = "supabase"; process.env.SUPABASE_URL = "https://cache-test.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-server-key"; process.env.SUPABASE_STORAGE_BUCKET = "assets";
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url.startsWith("http://127.0.0.1:")) return original(input, init);
      calls.push((init?.method ?? "GET") + " " + new URL(url).pathname);
      if (init?.method === "POST" && url.includes("/object/sign/")) return new Response(JSON.stringify({ signedURL: "/object/sign/assets/uploads/audio/route.mp3?token=private-test-token" }), { headers: { "Content-Type": "application/json" } });
      assert.ok(url.includes("/object/sign/"), "SDK full-object download is forbidden in streamed cache fill");
      const response = new Response(bytes, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(bytes.length) } });
      Object.defineProperties(response, {
        blob: { value: async () => { throw Error("must not buffer blob"); } },
        arrayBuffer: { value: async () => { throw Error("must not buffer arrayBuffer"); } },
      });
      return response;
    };
    const router = (await import("../routes/storage")).default;
    const app = express(); app.use("/api", router); server = app.listen(0);
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}/api/storage/objects/uploads/audio/route.mp3`;
    const first = await original(url); assert.equal(first.status, 200);
    assert.deepEqual(Buffer.from(await first.arrayBuffer()), bytes);
    const part = await original(url, { headers: { Range: "bytes=1-4" } });
    assert.equal(part.status, 206); assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(1, 5));
    assert.equal(calls.length, 2, "one private authorization and one source stream, then disk hits");
    for (const [, value] of first.headers) assert.ok(!value.includes("private-test-token"));
  } finally {
    server?.close(); globalThis.fetch = original;
    keys.forEach((key, i) => { if (saved[i] === undefined) delete process.env[key]; else process.env[key] = saved[i]; });
    await resetAudioCache(); await rm(dir, { recursive: true, force: true });
  }
});
