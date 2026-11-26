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

const CACHE_BUDGET = Math.max(8, Number(process.env["IMAGE_CACHE_MB"] ?? 32)) * 1024 * 1024;

/*
 * 메모리 보호 (무료 서버 512MB에서 그림 변환이 몰리면 서버가 꺼졌던 문제):
 * - sharp 자체 캐시 끄기, 변환 1개당 스레드 1개
 * - 동시에 내려받기+변환하는 그림은 최대 2장. 나머지는 줄 서서 기다림
 */
sharp.cache(false);
sharp.concurrency(1);
const CONVERT_LIMIT = Math.max(1, Number(process.env["IMAGE_CONVERT_CONCURRENCY"] ?? 1));
let converting = 0;
const waiting: Array<() => void> = [];
async function withConvertSlot<T>(work: () => Promise<T>): Promise<T> {
  if (converting >= CONVERT_LIMIT) await new Promise<void>((resolve) => waiting.push(resolve));
  converting++;
  try {
    return await work();
  } finally {
    converting--;
    waiting.shift()?.();
  }
}
const cache = new Map<string, Variant>();
let cachedBytes = 0;

function remember(key: string, value: Variant) {
  if (value.buffer.length > CACHE_BUDGET / 8) return; // 너무 큰 파일은 메모리에 두지 않는다
  if (memoryTight()) return;
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

/** 화면이 요청할 수 있는 폭 (아무 숫자나 받으면 변환본이 끝없이 늘어나므로 몇 단계로만) */
export const IMAGE_WIDTHS = [256, 384, 512, 640, 768, 1024] as const;
export function pickImageWidth(value: unknown): number | undefined {
  const n = Number(Array.isArray(value) ? value[0] : value);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return IMAGE_WIDTHS.find((w) => w >= n) ?? undefined;
}

export async function optimizeImage(raw: DownloadedImage, folder: string, webp: boolean, width?: number): Promise<Variant> {
  const type = raw.contentType ?? "application/octet-stream";
  if (!webp || !/^image\/(png|jpeg|jpg)$/i.test(type)) return { buffer: raw.buffer, contentType: type };
  const max = MAX_BOX[folder] ?? DEFAULT_BOX;
  // 폭을 요청하면 그만큼만 (세로는 폭의 2배까지): 휴대폰은 작은 그림으로 메모리를 아낀다
  const box = width ? { width: Math.min(max.width, width), height: Math.min(max.height, width * 2) } : max;
  try {
    const out = await sharp(raw.buffer, { failOn: "none", limitInputPixels: 40_000_000, sequentialRead: true })
      .rotate()
      .resize({ width: box.width, height: box.height, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 84, alphaQuality: 92, effort: 2 })
      .toBuffer();
    // 줄였는데 오히려 커지면 원본을 보낸다
    return out.length < raw.buffer.length ? { buffer: out, contentType: "image/webp" } : { buffer: raw.buffer, contentType: type };
  } catch {
    return { buffer: raw.buffer, contentType: type };
  }
}

/** 처음 요청에 원본을 보낼 때: 짧게만 보관 (다음 방문 때 줄인 WebP를 받도록) */
export const SHORT_CACHE = "public, max-age=600";

/** 디스크 확인 + 원본 내려받기: 같은 그림을 동시에 여러 번 요청해도 Supabase에는 한 번만 */
type Lookup = { variant?: Variant; raw?: DownloadedImage } | null;
const lookups = new Map<string, Promise<Lookup>>();
function lookupOnce(key: string, rawKey: string, download: () => Promise<DownloadedImage | null>) {
  let pending = lookups.get(key);
  if (!pending) {
    pending = (async (): Promise<Lookup> => {
      const stored = await diskRecall(key);
      if (stored) { remember(key, stored); return { variant: stored }; }
      const raw = await downloadOnce(rawKey, download);
      return raw ? { raw } : null;
    })().finally(() => lookups.delete(key));
    lookups.set(key, pending);
  }
  return pending;
}

/**
 * 서버 메모리 지키기 (무료 서버 512MB).
 * 2026-11-26: 카드 그림 80장을 한꺼번에 요청받자 원본 80장을 동시에 내려받아 메모리 초과로 꺼졌다.
 * - 원본은 동시에 몇 장씩만 내려받는다 (나머지는 줄 서서 기다림)
 * - 메모리가 빠듯하면 변환·메모리 보관을 멈추고 원본만 그대로 전달한다
 */
const DOWNLOAD_LIMIT = Math.max(1, Number(process.env["IMAGE_DOWNLOAD_CONCURRENCY"] ?? 4));
let downloading = 0;
const downloadQueue: Array<() => void> = [];
async function withDownloadSlot<T>(work: () => Promise<T>): Promise<T> {
  if (downloading >= DOWNLOAD_LIMIT) await new Promise<void>((resolve) => downloadQueue.push(resolve));
  downloading++;
  try { return await work(); } finally { downloading--; downloadQueue.shift()?.(); }
}
const RSS_LIMIT = Math.max(128, Number(process.env["IMAGE_RSS_LIMIT_MB"] ?? 360)) * 1024 * 1024;
export function memoryTight() {
  try { return process.memoryUsage().rss > RSS_LIMIT; } catch { return false; }
}

const downloads = new Map<string, Promise<DownloadedImage | null>>();
function downloadOnce(rawKey: string, download: () => Promise<DownloadedImage | null>) {
  let pending = downloads.get(rawKey);
  if (!pending) {
    pending = withDownloadSlot(download).finally(() => downloads.delete(rawKey));
    downloads.set(rawKey, pending);
  }
  return pending;
}

/** 뒤에서 천천히 WebP로 변환해 보관 (변환 대기열이 너무 길면 이번엔 건너뜀 → 다음 요청 때 다시) */
const conversions = new Map<string, Promise<Variant | null>>();
const MAX_BACKLOG = 6; // 대기 중인 변환은 원본을 메모리에 쥐고 있으므로 적게
function convertInBackground(key: string, raw: DownloadedImage, folder: string, webp: boolean, width?: number) {
  if (conversions.has(key) || conversions.size >= MAX_BACKLOG) return conversions.get(key) ?? null;
  if (memoryTight()) { clearImageMemory(); return null; } // 빠듯하면 이번엔 건너뜀 (다음 요청 때 다시)
  const job = withConvertSlot(() => {
    // RSS may have risen while this original was waiting behind another image.
    if (memoryTight()) { clearImageMemory(); return Promise.resolve(null); }
    return optimizeImage(raw, folder, webp, width);
  })
    .then((result) => { if (result) { remember(key, result); void diskRemember(key, result); } return result; }, () => null)
    .finally(() => conversions.delete(key));
  conversions.set(key, job);
  return job;
}

/**
 * 이미지를 보낸다. 없으면 false.
 * - 이미 줄여 둔 WebP가 있으면(메모리·디스크) 바로 보낸다 (1년 보관)
 * - 없으면 기다리게 하지 않고 원본을 바로 보내고(10분 보관), 변환은 뒤에서 한다
 *   (무료 서버 CPU가 약해 변환을 기다리면 그림이 몇 초씩 늦게 떴음)
 */
export async function deliverImage(
  objectPath: string,
  folder: string,
  webp: boolean,
  download: () => Promise<DownloadedImage | null>,
  response: Response,
  width?: number,
): Promise<boolean> {
  const key = `${objectPath}|${webp ? "webp" : "orig"}${width ? `|w${width}` : ""}`;
  // 원본 내려받기는 폭과 상관없이 한 번만
  const rawKey = `${objectPath}|${webp ? "webp" : "orig"}|raw`;
  const variant: Variant | null | undefined = recall(key);
  if (variant) {
    send(response, variant, IMMUTABLE_CACHE);
    return true;
  }
  const found = await lookupOnce(key, rawKey, download);
  if (found?.variant) {
    send(response, found.variant, IMMUTABLE_CACHE);
    return true;
  }
  const raw = found?.raw;
  if (!raw) return false;
  const type = raw.contentType ?? "application/octet-stream";
  const convertible = webp && /^image\/(png|jpeg|jpg)$/i.test(type);
  if (!convertible) {
    const original = { buffer: raw.buffer, contentType: type };
    remember(key, original);
    send(response, original, IMMUTABLE_CACHE);
    return true;
  }
  convertInBackground(key, raw, folder, webp, width);
  send(response, { buffer: raw.buffer, contentType: type }, SHORT_CACHE);
  return true;
}

function send(response: Response, variant: Variant, cache: string) {
  response.setHeader("Content-Type", variant.contentType);
  response.setHeader("Content-Length", String(variant.buffer.length));
  response.setHeader("Cache-Control", cache);
  response.setHeader("Vary", "Accept");
  response.end(variant.buffer);
}

/** 테스트용: 뒤에서 하는 변환이 끝날 때까지 기다린다 */
export async function settleImageConversions() {
  await Promise.all([...conversions.values()]);
  await new Promise((r) => setTimeout(r, 30));
}

/** 테스트·운영 확인용 */
export function imageCacheStats() {
  return { entries: cache.size, bytes: cachedBytes, budget: CACHE_BUDGET, converting: conversions.size };
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
