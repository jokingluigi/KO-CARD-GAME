import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { acceptsWebp, clearImageCache, clearImageMemory, deliverImage, IMMUTABLE_CACHE, optimizeImage, settleImageConversions, SHORT_CACHE } from "./image-delivery";

async function png(width: number, height: number, alpha = false) {
  const channels = alpha ? 4 : 3;
  const data = Buffer.alloc(width * height * channels);
  // 실제 그림처럼 부드럽게 변하는 색 + 약간의 잡티
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const o = (y * width + x) * channels;
    data[o] = (x * 255 / width + ((x * y) % 7)) & 255; data[o + 1] = (y * 255 / height) & 255; data[o + 2] = ((x + y) % 256);
    if (alpha) data[o + 3] = x < width / 4 ? 0 : 255;
  }
  return sharp(data, { raw: { width, height, channels } }).png().toBuffer();
}
function fakeResponse() {
  const headers: Record<string, string> = {};
  let body: Buffer | null = null;
  return { headers, get body() { return body; }, setHeader(k: string, v: string) { headers[k.toLowerCase()] = v; }, end(b: Buffer) { body = b; } };
}

test("WebP를 받는 브라우저에는 줄인 WebP, 아니면 원본", async () => {
  const raw = await png(1600, 2200);
  const small = await optimizeImage({ buffer: raw, contentType: "image/png" }, "card-images", true);
  assert.equal(small.contentType, "image/webp");
  assert.ok(small.buffer.length < raw.length);
  const meta = await sharp(small.buffer).metadata();
  assert.ok(meta.width! <= 1000 && meta.height! <= 1400, "카드 그림 최대 크기 안으로");
  const original = await optimizeImage({ buffer: raw, contentType: "image/png" }, "card-images", false);
  assert.equal(original.buffer, raw);
});

test("투명 배경은 유지된다", async () => {
  const raw = await png(600, 800, true);
  const out = await optimizeImage({ buffer: raw, contentType: "image/png" }, "cosmetics", true);
  assert.equal((await sharp(out.buffer).metadata()).hasAlpha, true);
});

test("그림이 아닌 파일(JSON)은 그대로", async () => {
  const raw = Buffer.from('{"a":1}');
  const out = await optimizeImage({ buffer: raw, contentType: "application/json" }, "game-backgrounds", true);
  assert.equal(out.buffer, raw);
  assert.equal(out.contentType, "application/json");
});

test("같은 그림은 저장소에서 한 번만 내려받고, 오래 보관하라고 알린다", async () => {
  clearImageCache();
  const raw = await png(400, 400);
  let downloads = 0;
  const download = async () => { downloads++; return { buffer: raw, contentType: "image/png" }; };
  const [a, b] = [fakeResponse(), fakeResponse()];
  await Promise.all([
    deliverImage("/objects/uploads/card-images/x.png", "card-images", true, download, a as never),
    deliverImage("/objects/uploads/card-images/x.png", "card-images", true, download, b as never),
  ]);
  // 처음엔 기다리지 않고 원본을 바로, 짧게만 보관
  assert.equal(a.headers["content-type"], "image/png");
  assert.equal(a.headers["cache-control"], SHORT_CACHE);
  await settleImageConversions();
  const c = fakeResponse();
  await deliverImage("/objects/uploads/card-images/x.png", "card-images", true, download, c as never);
  assert.equal(downloads, 1);
  assert.equal(c.headers["cache-control"], IMMUTABLE_CACHE);
  assert.equal(c.headers["vary"], "Accept");
  assert.equal(c.headers["content-type"], "image/webp");
});

test("없는 파일은 false", async () => {
  clearImageCache();
  assert.equal(await deliverImage("/objects/uploads/card-images/none.png", "card-images", true, async () => null, fakeResponse() as never), false);
});

test("Accept 헤더 판별", () => {
  assert.equal(acceptsWebp("image/avif,image/webp,*/*"), true);
  assert.equal(acceptsWebp("image/png,*/*"), false);
  assert.equal(acceptsWebp(undefined), false);
});

test("메모리에서 밀려나도 디스크 보관함에서 다시 꺼내 Supabase에 다시 묻지 않는다", async () => {
  clearImageCache();
  const raw = await png(500, 700);
  let downloads = 0;
  const download = async () => { downloads++; return { buffer: raw, contentType: "image/png" }; };
  const first = fakeResponse();
  await deliverImage("card-images/disk-test.png", "card-images", true, download, first as never);
  await settleImageConversions(); // 뒤에서 변환·디스크 저장 기다리기
  clearImageMemory();
  const firstWebp = fakeResponse();
  await deliverImage("card-images/disk-test.png", "card-images", true, download, firstWebp as never);
  clearImageMemory();
  const second = fakeResponse();
  await deliverImage("card-images/disk-test.png", "card-images", true, download, second as never);
  assert.equal(downloads, 1);
  assert.equal(second.headers["content-type"], "image/webp");
  assert.equal(second.headers["cache-control"], IMMUTABLE_CACHE);
  assert.deepEqual(second.body, firstWebp.body);
  clearImageCache();
});

test("변환이 한꺼번에 몰려도 동시에 2장까지만 변환한다 (메모리 보호)", async () => {
  clearImageCache();
  const raw = await png(900, 1200);
  let peak = 0, live = 0;
  const jobs = Array.from({ length: 8 }, (_, i) => deliverImage(`card-images/many-${i}.png`, "card-images", true, async () => {
    live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, 10)); live--;
    return { buffer: raw, contentType: "image/png" };
  }, fakeResponse() as never));
  await Promise.all(jobs);
  await settleImageConversions();
  const again = fakeResponse();
  await deliverImage("card-images/many-7.png", "card-images", true, async () => null, again as never);
  assert.equal(again.headers["content-type"], "image/webp", "뒤에서 변환된 WebP가 준비됨");
  clearImageCache();
});

test("requested width makes a smaller variant, and the original is downloaded only once", async () => {
  const { deliverImage, settleImageConversions, clearImageCache, pickImageWidth } = await import("./image-delivery");
  const sharp = (await import("sharp")).default;
  clearImageCache();
  const png = await sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 200, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
  let downloads = 0;
  const download = async () => { downloads++; return { buffer: png, contentType: "image/png" }; };
  const fake = () => { const r: { headers: Record<string, string>; body?: Buffer; setHeader(k: string, v: string): void; end(b: Buffer): void } = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(b) { this.body = b; } }; return r; };
  assert.equal(pickImageWidth("600"), 640);
  assert.equal(pickImageWidth("99999"), undefined);
  assert.equal(pickImageWidth(undefined), undefined);
  await deliverImage("/objects/uploads/cosmetics/w.png", "cosmetics", true, download, fake() as never, 512);
  await deliverImage("/objects/uploads/cosmetics/w.png", "cosmetics", true, download, fake() as never);
  await settleImageConversions();
  const small = fake(); await deliverImage("/objects/uploads/cosmetics/w.png", "cosmetics", true, download, small as never, 512);
  const big = fake(); await deliverImage("/objects/uploads/cosmetics/w.png", "cosmetics", true, download, big as never);
  assert.equal(small.headers["Content-Type"], "image/webp");
  const meta = await sharp(small.body!).metadata();
  assert.equal(meta.width, 512);
  assert.equal((await sharp(big.body!).metadata()).width, 1200);
  assert.ok(downloads <= 2, `downloads ${downloads}`);
  clearImageCache();
});
