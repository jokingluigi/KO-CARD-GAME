import test from "node:test";
import assert from "node:assert/strict";
import { sizedImage, sizedSrcSet, isResizableImage } from "./sized-image";

test("only uploaded png/jpg images get a width", () => {
  const u = "/api/storage/objects/uploads/cosmetics/abc.png";
  assert.equal(sizedImage(u, 600), `${u}?w=640`);
  assert.equal(sizedImage(u, 5000), u);
  assert.equal(sizedImage("/vendor/crowd/x.webp", 600), "/vendor/crowd/x.webp");
  assert.equal(sizedImage("/api/storage/objects/uploads/cosmetics/a.webp", 600), "/api/storage/objects/uploads/cosmetics/a.webp");
  assert.equal(sizedImage(null, 600), null);
  assert.equal(isResizableImage("https://ko-card-game.onrender.com/api/storage/objects/uploads/card-images/x.jpg"), true);
  assert.match(sizedSrcSet(u)!, /\?w=256 256w, .*abc\.png 1400w$/);
  assert.equal(sizedSrcSet("data:image/png;base64,xx"), undefined);
});
