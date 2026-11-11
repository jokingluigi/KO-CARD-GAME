import assert from "node:assert/strict";
import test from "node:test";
import sharp from "../../artifacts/api-server/node_modules/sharp/lib/index.js";
import { detectFrameWindows } from "../../artifacts/ko-game/src/lib/card-frame-windows.ts";
const root = "docs/qa/20261111-registered-preview/assets";
const points = {
  "WRESTLER-CHAMPION": [15.24, 10.26, 12.13, 89.38, 87.59, 89.37],
  "WRESTLER-NORMAL": [15.4, 10.25, 12.05, 88.79, 87.65, 88.79],
  "WRESTLER-EPIC": [15.37, 10.24, 11.99, 89.12, 87.72, 89.12],
  "WRESTLER-LEGENDARY": [15.34, 10.22, 12.06, 89.12, 87.72, 89.1],
  "TECHNIQUE-NORMAL": [11.62, 9.58],
  "TECHNIQUE-EPIC": [15.03, 10],
};
async function pixels(name) {
  const { data, info } = await sharp(root + "/" + name + ".png")
    .resize({ height: 384 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };
}
for (const [name, expected] of Object.entries(points))
  test("actual registered PNG windows: " + name, async () => {
    const p = await pixels(name),
      w = detectFrameWindows(p.data, p.width, p.height);
    assert.ok(w);
    assert.ok(Math.abs(w.cost.centerX - expected[0]) < 0.5);
    assert.ok(Math.abs(w.cost.centerY - expected[1]) < 0.5);
    if (name.startsWith("WRESTLER")) {
      assert.ok(w.name && w.name.top < 9);
      assert.ok(w.rules && w.rules.top > 69);
      assert.ok(Math.abs(w.attack.centerX - expected[2]) < 0.5);
      assert.ok(Math.abs(w.attack.centerY - expected[3]) < 0.5);
      assert.ok(Math.abs(w.health.centerX - expected[4]) < 0.5);
      assert.ok(Math.abs(w.health.centerY - expected[5]) < 0.5);
      assert.equal(w.opaqueArtWindow, undefined);
    }
  });
test("unrecognizable and malformed images do not invent a layout", () => {
  assert.equal(
    detectFrameWindows(new Uint8ClampedArray(100 * 100 * 4), 100, 100),
    null,
  );
  assert.equal(detectFrameWindows(new Uint8ClampedArray(4), 100, 100), null);
});
test("an opaque black artwork opening can be cut out without changing the nameplate or cost", async () => {
  const p = await pixels("WRESTLER-CHAMPION");
  for (let y = Math.ceil(p.height * 0.15); y < p.height * 0.69; y++)
    for (let x = Math.ceil(p.width * 0.105); x < p.width * 0.89; x++) {
      const o = (y * p.width + x) * 4;
      if (p.data[o + 3] < 40) {
        p.data[o] = p.data[o + 1] = p.data[o + 2] = 0;
        p.data[o + 3] = 255;
      }
    }
  const w = detectFrameWindows(p.data, p.width, p.height);
  assert.ok(w.opaqueArtWindow);
  assert.ok(w.name && w.rules);
  assert.ok(Math.abs(w.cost.centerX - 15.24) < 0.5);
});
