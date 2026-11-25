import sharp from "sharp";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import path from "node:path";
import type { Response } from "express";

/**
 * 이미지 전달 최적화 (Supabase 전송량 절감).
 *
 * - 업로드 파일은 이름이 매번 새로 만들어지는 고유 이름이라 내용이 바뀌지 않는다
 *   → 브라우저가 1년 동안 보관해도 안전하다 (immutable).
 * - WebP를 받을 수 있는 브라우저에는 화면에 필요한 크기로 줄인 WebP를 보낸다
 *   (원본 PNG/JPG 평균 1.4MB → 보통 100~200KB).
 * - 한 번 만든 결과는 서버 메모리에 보관해서, 같은 그림을 다른 플레이어가 요청해도
 *   Supabase에서 다시 내려받지 않는다.
 */

export type DownloadedImage = { buffer: Buffer; contentType: string | null };
type Variant = { buffer: Buffer; contentType: string };

/** 폴더별 최대 크기 (긴 변 기준이 아니라 '이 상자 안에 들어가게'). 화면 최대 표시 크기의 약 2배. */
const MAX_BOX: Record<string, { width: number; height: number }> = {
  "card-images": { width: 1000, height: 1400 },
  "game-backgrounds": { width: 1920, height: 1920 },
  cosmetics: { width: 1400, height: 1400 },
  "shop-decks": { width: 1000, height: 1000 },
};
const DEFAULT_BOX = { width: 1400, height: 1400 };

export const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

const CACHE_BUDGET = Math.max(8, Number(process.env["IMAGE_CACHE_MB"] ?? 64)) * 1024 * 1024;
const cache = new Map<string, Variant>();
let cachedBytes = 0;
const inflight = new Map<string, Promise<Variant | null>>();

function remember(key: string, value: Variant) {
  if (value.buffer.length > CACHE_BUDGET / 8) return; // 너무 큰 파일은 메모리에 두지 않는다
  const old = cache.get(key);
  if (old) { cachedBytes -= old.buffer.length; cache.delete(key); }
  cache.set(key, value);
  cachedBytes += value.buffer.length;
  for (const [oldKey, entry] of cache) {
    if (cachedBytes <= CACHE_BUDGET) break;
    cache.delete(oldKey);
    cachedBytes -= entry.buffer.length;
  }
}
/**
 * 디스크 보관함: 메모리에서 밀려난 그림도 서버 임시 폴더에 남겨 두어
 * Supabase에서 다시 내려받지 않게 한다. (서버가 재시작되면 비워진다)
 */
const DISK_BUDGET = Math.max(0, Number(process.env["IMAGE_DISK_CACHE_MB"] ?? 400)) * 1024 * 1024;
const DISK_DIR = path.join(tmpdir(), "ko-image-cache");
let diskBytes = 0;
let diskReady: Promise<boolean> | null = null;
function diskFile(key: string) {
  return path.join(DISK_DIR, createHash("sha1").update(key).digest("hex"));
}
function ensureDisk() {
  diskReady ??= mkdir(DISK_DIR, { recursive: true }).then(() => true, () => false);
  return diskReady;
}
async function diskRecall(key: string): Promise<Variant | null> {
  if (!DISK_BUDGET || !(await ensureDisk())) return null;
  try {
    const file = diskFile(key);
    const [buffer, meta] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
    return { buffer, contentType: meta };
  } catch {
    return null;
  }
}
async function diskRemember(key: string, value: Variant) {
  if (!DISK_BUDGET || diskBytes + value.buffer.length > DISK_BUDGET || !(await ensureDisk())) return;
  try {
    const file = diskFile(key);
    await writeFile(`${file}.type`, value.contentType);
    await writeFile(`${file}.tmp`, value.buffer);
    await rename(`${file}.tmp`, file); // 다 쓴 뒤에만 보이게 (반쯤 쓴 파일을 읽지 않도록)
    diskBytes += value.buffer.length;
  } catch {
    /* 디스크가 꽉 차도 게임에는 영향 없음 */
  }
}

function recall(key: string) {
  const hit = cache.get(key);
  if (hit) { cache.delete(key); cache.set(key, hit); } // 최근 사용 순서 갱신
  return hit;
}

export function acceptsWebp(accept: string | undefined) {
  return /image\/webp/i.test(accept ?? "");
}

export async function optimizeImage(raw: DownloadedImage, folder: string, webp: boolean): Promise<Variant> {
  const type = raw.contentType ?? "application/octet-stream";
  if (!webp || !/^image\/(png|jpeg|jpg)$/i.test(type)) return { buffer: raw.buffer, contentType: type };
  const box = MAX_BOX[folder] ?? DEFAULT_BOX;
  try {
    const out = await sharp(raw.buffer, { failOn: "none", limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: box.width, height: box.height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 92, effort: 4 })
      .toBuffer();
    // 줄였는데 오히려 커지면 원본을 보낸다
    return out.length < raw.buffer.length ? { buffer: out, contentType: "image/webp" } : { buffer: raw.buffer, contentType: type };
  } catch {
    return { buffer: raw.buffer, contentType: type };
  }
}

/** 이미지를 보낸다. 없으면 false. */
export async function deliverImage(
  objectPath: string,
  folder: string,
  webp: boolean,
  download: () => Promise<DownloadedImage | null>,
  response: Response,
): Promise<boolean> {
  const key = `${objectPath}|${webp ? "webp" : "orig"}`;
  let variant: Variant | null | undefined = recall(key);
  if (!variant) {
    let pending = inflight.get(key);
    if (!pending) {
      pending = (async () => {
        const stored = await diskRecall(key);
        if (stored) { remember(key, stored); return stored; }
        const raw = await download();
        if (!raw) return null;
        const result = await optimizeImage(raw, folder, webp);
        remember(key, result);
        void diskRemember(key, result);
        return result;
      })().finally(() => inflight.delete(key));
      inflight.set(key, pending);
    }
    variant = await pending;
  }
  if (!variant) return false;
  response.setHeader("Content-Type", variant.contentType);
  response.setHeader("Content-Length", String(variant.buffer.length));
  response.setHeader("Cache-Control", IMMUTABLE_CACHE);
  response.setHeader("Vary", "Accept");
  response.end(variant.buffer);
  return true;
}

/** 테스트·운영 확인용 */
export function imageCacheStats() {
  return { entries: cache.size, bytes: cachedBytes, budget: CACHE_BUDGET };
}
/** 메모리 보관함만 비운다 (디스크 보관함은 남김) */
export function clearImageMemory() { cache.clear(); cachedBytes = 0; }
/** 메모리·디스크 보관함 모두 비운다 */
export function clearImageCache() {
  clearImageMemory();
  rmSync(DISK_DIR, { recursive: true, force: true });
  diskReady = null;
  diskBytes = 0;
}
