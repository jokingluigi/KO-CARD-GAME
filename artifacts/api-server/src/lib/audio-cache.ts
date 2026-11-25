import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Response } from "express";
import { IMMUTABLE_CACHE, type DownloadedImage } from "./image-delivery";

/**
 * 음악·효과음 디스크 보관함 (Supabase 전송량 절감).
 *
 * 처음 한 번만 Supabase에서 통째로 받아 서버 임시 폴더에 저장하고,
 * 그다음부터는 서버에 있는 파일을 바로 보낸다 (구간 재생(Range)도 지원).
 * 서버가 재시작되면 비워지고, 그때 다시 한 번만 받는다.
 */
const DISK_BUDGET = Math.max(0, Number(process.env["AUDIO_DISK_CACHE_MB"] ?? 300)) * 1024 * 1024;
const MAX_FILE = 25 * 1024 * 1024;
let dir = path.join(tmpdir(), "ko-audio-cache");
let usedBytes = 0;
const inflight = new Map<string, Promise<{ file: string; contentType: string } | null>>();
const known = new Map<string, { file: string; contentType: string }>();

function fileFor(objectPath: string) {
  const ext = path.extname(objectPath).replace(/[^.a-z0-9]/gi, "").slice(0, 8);
  return path.join(dir, createHash("sha1").update(objectPath).digest("hex") + ext);
}

async function prepare(objectPath: string, download: () => Promise<DownloadedImage | null>) {
  const hit = known.get(objectPath);
  if (hit) {
    try { await stat(hit.file); return hit; } catch { known.delete(objectPath); }
  }
  const raw = await download();
  if (!raw) return null;
  const contentType = raw.contentType ?? "application/octet-stream";
  if (raw.buffer.length > MAX_FILE || usedBytes + raw.buffer.length > DISK_BUDGET) {
    return { buffer: raw.buffer, contentType } as never; // 보관하지 않고 바로 보냄
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
): Promise<boolean | null> {
  if (!DISK_BUDGET) return null;
  let pending = inflight.get(objectPath);
  if (!pending) {
    pending = prepare(objectPath, download).finally(() => inflight.delete(objectPath));
    inflight.set(objectPath, pending);
  }
  const entry = await pending as { file: string; contentType: string } | (DownloadedImage & { contentType: string }) | null;
  if (!entry) return false;
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
