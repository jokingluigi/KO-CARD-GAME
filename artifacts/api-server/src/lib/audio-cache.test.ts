import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { tmpdir } from "node:os";
import path from "node:path";
import { deliverCachedAudio, resetAudioCache } from "./audio-cache";

test("음악은 Supabase에서 한 번만 받고, 그다음부터 서버에서 바로 보낸다 (구간 재생 포함)", async () => {
  await resetAudioCache(path.join(tmpdir(), `ko-audio-test-${process.pid}`));
  const bytes = Buffer.from(Array.from({ length: 5000 }, (_, i) => i % 251));
  let downloads = 0;
  const app = express();
  app.get("/a.mp3", async (_req, res) => {
    const ok = await deliverCachedAudio("/objects/uploads/game-bgm/a.mp3", async () => { downloads++; return { buffer: bytes, contentType: "audio/mpeg" }; }, res);
    if (!ok) res.status(404).end();
  });
  app.get("/missing.mp3", async (_req, res) => {
    const ok = await deliverCachedAudio("/objects/uploads/game-bgm/missing.mp3", async () => null, res);
    if (!ok) res.status(404).end();
  });
  const server = app.listen(0);
  const port = (server.address() as { port: number }).port;
  try {
    const [one, two] = await Promise.all([fetch(`http://127.0.0.1:${port}/a.mp3`), fetch(`http://127.0.0.1:${port}/a.mp3`)]);
    assert.deepEqual(Buffer.from(await one.arrayBuffer()), bytes);
    assert.deepEqual(Buffer.from(await two.arrayBuffer()), bytes);
    assert.equal(one.headers.get("content-type"), "audio/mpeg");
    assert.match(one.headers.get("cache-control") ?? "", /immutable/);
    const part = await fetch(`http://127.0.0.1:${port}/a.mp3`, { headers: { Range: "bytes=100-199" } });
    assert.equal(part.status, 206);
    assert.deepEqual(Buffer.from(await part.arrayBuffer()), bytes.subarray(100, 200));
    assert.equal(downloads, 1, "동시에 와도, 여러 번 와도 Supabase에서는 한 번만");
    assert.equal((await fetch(`http://127.0.0.1:${port}/missing.mp3`)).status, 404);
  } finally {
    server.close();
    await resetAudioCache();
  }
});
