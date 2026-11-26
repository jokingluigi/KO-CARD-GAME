import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Response } from "express";
import { IMMUTABLE_CACHE, type DownloadedImage } from "./image-delivery";
import { AssetFileTooLargeError, type DownloadedAssetFile } from "./asset-file-download";

/**
 * 음악·효과음 디스크 보관함 (Supabase 전송량 절감).
 *
 * 처음 한 번만 Supabase에서 서버 임시 파일로 흘려 저장하고,
 * 그다음부터는 서버에 있는 파일을 바로 보낸다 (구간 재생(Range)도 지원).
 * 서버가 재시작되면 비워지고, 그때 다시 한 번만 받는다.
 */
const DISK_BUDGET = Math.max(0, Number(process.env["AUDIO_DISK_CACHE_MB"] ?? 300)) * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
export type AudioFileDownload = (target: string, maxBytes: number) => Promise<DownloadedAssetFile | null>;
type CacheEntry = { file: string; contentType: string };
type Prepared = CacheEntry | (DownloadedImage & { contentType: string }) | { bypass: true } | null;
let dir = path.join(tmpdir(), "ko-audio-cache");
let usedBytes = 0;
const inflight = new Map<string, Promise<Prepared>>();
const known = new Map<string, CacheEntry>();

function fileFor(objectPath: string) {
  const ext = path.extname(objectPath).replace(/[^.a-z0-9]/gi, "").slice(0, 8);
  return path.join(dir, createHash("sha1").update(objectPath).digest("hex") + ext);
}

async function prepare(objectPath: string, download: () => Promise<DownloadedImage | null>, downloadToFile?: AudioFileDownload): Promise<Prepared> {
  const hit = known.get(objectPath);
  if (hit) {
    try { await stat(hit.file); return hit; } catch { known.delete(objectPath); }
  }
  if (downloadToFile) {
    if (usedBytes >= DISK_BUDGET) return { bypass: true };
    await mkdir(dir, { recursive: true });
    const file = fileFor(objectPath);
    const staging = `${file}.${randomUUID()}.tmp`;
    let reserved = 0;
    try {
      const saved = await downloadToFile(staging, MAX_FILE);
      if (!saved) return null;
      const info = await stat(staging);
      if (info.size > MAX_FILE || usedBytes + info.size > DISK_BUDGET) return { bypass: true };
      // Reserve actual bytes synchronously before the rename can interleave.
      reserved = info.size;
      usedBytes += reserved;
      await rename(staging, file);
      const entry = { file, contentType: saved.contentType ?? "application/octet-stream" };
      known.set(objectPath, entry);
      reserved = 0;
      return entry;
    } catch (error) {
      if (error instanceof AssetFileTooLargeError) return { bypass: true };
      throw error;
    } finally {
      usedBytes -= reserved;
      await rm(staging, { force: true });
    }
  }
  // Compatibility for older storage adapters; production adapters stream above.
  const raw = await download();
  if (!raw) return null;
  const contentType = raw.contentType ?? "application/octet-stream";
  if (raw.buffer.length > MAX_FILE || usedBytes + raw.buffer.length > DISK_BUDGET) {
    return { buffer: raw.buffer, contentType }; // 보관하지 않고 바로 보냄
  }
  await mkdir(dir, { recursive: true });
  const file = fileFor(objectPath);
  await writeFile(`${file}.tmp`, raw.buffer);
  await rename(`${file}.tmp`, file);
  usedBytes += raw.buffer.length;
  const entry = { file, contentType };
  known.set(objectPath, entry);
  return entry;
}

/** 음악 파일을 보낸다. 없으면 false. 디스크 보관함을 쓸 수 없으면 null (→ 예전 방식으로 보냄). */
export async function deliverCachedAudio(
  objectPath: string,
  download: () => Promise<DownloadedImage | null>,
  response: Response,
  downloadToFile?: AudioFileDownload,
): Promise<boolean | null> {
  if (!DISK_BUDGET) return null;
  let pending = inflight.get(objectPath);
  if (!pending) {
    pending = prepare(objectPath, download, downloadToFile).finally(() => inflight.delete(objectPath));
    inflight.set(objectPath, pending);
  }
  const entry = await pending;
  if (!entry) return false;
  if ("bypass" in entry) return null;
  response.setHeader("Content-Type", entry.contentType);
  response.setHeader("Cache-Control", IMMUTABLE_CACHE);
  if ("buffer" in entry) {
    response.setHeader("Content-Length", String(entry.buffer.length));
    response.end(entry.buffer);
    return true;
  }
  await new Promise<void>((resolve, reject) => {
    response.sendFile(entry.file, { cacheControl: false, acceptRanges: true }, (error) => {
      if (error && !response.headersSent) reject(error); else resolve();
    });
  });
  return true;
}

/** 테스트용 */
export async function resetAudioCache(nextDir?: string) {
  await rm(dir, { recursive: true, force: true });
  if (nextDir) dir = nextDir;
  known.clear();
  usedBytes = 0;
}
