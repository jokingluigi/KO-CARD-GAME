/** Synthetic loopback benchmark. No production traffic, accounts or DB access. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { setTimeout as delay } from 'node:timers/promises';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const baselineCommit = process.argv[2] ?? '36c68bdebcd44cc6bccc782ce30cd6366f490f0a';
assert.match(baselineCommit, /^[a-f0-9]{40}$/);
const baselineDir = path.join(root, '.local/audio-cache-memory-baseline');
await mkdir(baselineDir, { recursive: true });
await writeFile(path.join(baselineDir, 'audio-cache.ts'), execFileSync('git', ['show', `${baselineCommit}:artifacts/api-server/src/lib/audio-cache.ts`], { cwd: root }));
await rm(path.join(baselineDir, 'image-delivery.ts'), { force: true });
await symlink(path.join(root, 'artifacts/api-server/src/lib/image-delivery.ts'), path.join(baselineDir, 'image-delivery.ts'));

const size = 8 * 1024 * 1024, chunkSize = 64 * 1024;
const server = createServer((request, response) => {
  const id = Number(request.url.slice(1));
  assert.ok(Number.isInteger(id) && id >= 0 && id < 16);
  response.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': size });
  const chunk = Buffer.alloc(chunkSize, id + 1);
  const source = Readable.from((async function* () {
    for (let sent = 0; sent < size; sent += chunk.length) {
      await delay(1); yield chunk;
    }
  })());
  source.on('error', () => response.destroy());
  response.once('close', () => source.destroy());
  source.pipe(response);
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
async function run(mode) {
  const modulePath = mode === 'buffered'
    ? path.join(baselineDir, 'audio-cache.ts')
    : path.join(root, 'artifacts/api-server/src/lib/audio-cache.ts');
  const args = ['--expose-gc', '--max-old-space-size=192', '--import', './docs/qa/checkpoints/20261006/qa-loader.mjs', './docs/qa/20261126-audio-cache-memory/worker.mjs', modulePath, root, origin, mode];
  const environment = { ...process.env, MALLOC_ARENA_MAX: '2', AUDIO_DISK_CACHE_MB: '300' };
  delete environment.DATABASE_URL; delete environment.RENDER_API_KEY;
  const child = spawn(process.execPath, args, { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(code, 0, stderr);
  const result = JSON.parse(stdout.trim());
  assert.equal(result.delivered, 16 * size);
  assert.equal(result.buffered, mode === 'buffered' ? 16 : 0);
  assert.equal(result.streamed, mode === 'streamed' ? 16 : 0);
  return result;
}
try {
  for (let trial = 0; trial < 3; trial++) {
    for (const mode of trial % 2 ? ['streamed', 'buffered'] : ['buffered', 'streamed']) {
      const result = await run(mode); results.push({ trial: trial + 1, ...result });
      console.log(JSON.stringify({ trial: trial + 1, mode, peakRssMiB: result.peak.rss / 1048576, peakArrayBuffersMiB: result.peak.arrayBuffers / 1048576, elapsedMs: result.elapsedMs }));
    }
  }
  for (let trial = 1; trial <= 3; trial++) {
    const pair = results.filter((r) => r.trial === trial);
    assert.deepEqual(pair[0].hashes, pair[1].hashes, 'every delivered byte must match');
  }
  const median = (values) => [...values].sort((a, b) => a - b)[1];
  const summary = Object.fromEntries(['buffered', 'streamed'].map((mode) => {
    const rows = results.filter((r) => r.mode === mode);
    return [mode, {
      medianPeakRssMiB: median(rows.map((r) => r.peak.rss / 1048576)),
      medianRssGrowthMiB: median(rows.map((r) => (r.peak.rss - r.before.rss) / 1048576)),
      medianPeakArrayBuffersMiB: median(rows.map((r) => r.peak.arrayBuffers / 1048576)),
      medianElapsedMs: median(rows.map((r) => r.elapsedMs)),
    }];
  }));
  const report = { at: new Date().toISOString(), baselineCommit, fixture: '16 distinct 8MiB tracks simultaneously; 128MiB delivered with identical hashes', samplesPerMode: 3, samplerMs: 2, environment: 'local Node child processes, MALLOC_ARENA_MAX=2, 192MiB V8 heap cap; no 512MiB cgroup limit and not the entire API', productionTraffic: 0, scope: 'cold audio disk-cache fill; not browser playback latency, all game modes, or live Render savings', summary, results };
  if (process.env.KO_AUDIO_BENCH_OUTPUT) await writeFile(process.env.KO_AUDIO_BENCH_OUTPUT, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ summary }));
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
