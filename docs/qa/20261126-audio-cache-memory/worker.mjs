import { createReadStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const [modulePath, root, origin, mode] = process.argv.slice(2);
const { deliverCachedAudio, resetAudioCache } = await import(pathToFileURL(modulePath));
const { downloadAssetFile } = await import(pathToFileURL(path.join(root, 'artifacts/api-server/src/lib/asset-file-download.ts')));
const dir = await mkdtemp(path.join(tmpdir(), 'ko-audio-memory-'));
await resetAudioCache(dir);
global.gc();
const before = process.memoryUsage();
const peak = { rss: before.rss, external: before.external, arrayBuffers: before.arrayBuffers };
const capture = () => {
  const memory = process.memoryUsage();
  for (const key of Object.keys(peak)) peak[key] = Math.max(peak[key], memory[key]);
};
const sampler = setInterval(capture, 2);
const hashes = [];
let buffered = 0, streamed = 0, delivered = 0;
const began = performance.now();
try {
  await Promise.all(Array.from({ length: 16 }, async (_, i) => {
    const response = {
      headersSent: false,
      setHeader() {},
      sendFile(file, _options, done) {
        const hash = createHash('sha256');
        pipeline(createReadStream(file), new Writable({ write(chunk, _enc, next) {
          delivered += chunk.length; hash.update(chunk); capture(); next();
        } })).then(() => { hashes[i] = hash.digest('hex'); done(); }, done);
      },
    };
    const result = await deliverCachedAudio(`/objects/uploads/game-bgm/${i}.mp3`, async () => {
      buffered++;
      // Match the Supabase SDK's Blob -> ArrayBuffer -> Buffer path.
      const upstream = await fetch(`${origin}/${i}`);
      const blob = await upstream.blob();
      const buffer = Buffer.from(await blob.arrayBuffer());
      capture();
      return { buffer, contentType: 'audio/mpeg' };
    }, response, mode === 'streamed' ? async (file, maxBytes) => {
      streamed++;
      return downloadAssetFile(`${origin}/${i}`, file, maxBytes);
    } : undefined);
    if (result !== true) throw Error('Fixture must deliver all tracks from cache');
  }));
  capture();
  const elapsedMs = performance.now() - began;
  global.gc();
  console.log(JSON.stringify({ mode, before, peak, afterGc: process.memoryUsage(), buffered, streamed, delivered, hashes, elapsedMs }));
} finally {
  clearInterval(sampler);
  await resetAudioCache();
  await rm(dir, { recursive: true, force: true });
}
