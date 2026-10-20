/** Run after the normal production build. The opt-in and QA entry must be absent. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const root = "artifacts/ko-game/dist/public";
const files = [];
async function walk(path) {
  for (const e of await readdir(path, { withFileTypes: true })) {
    const name = join(path, e.name);
    if (e.isDirectory()) await walk(name);
    else files.push(name);
  }
}
await walk(root);
assert.ok(files.some((f) => f.endsWith("/index.html")));
for (const f of files) {
  assert.ok(!f.includes("/qa/black-gold"), "QA page excluded");
  assert.ok(
    !/walnut-table|linen-field|black-linen/.test(f),
    "Development-only textures excluded",
  );
  if (/\.(?:js|css|html)$/.test(f)) {
    const text = await readFile(f, "utf8");
    for (const token of [
      "ko-dev-black-gold-board",
      "--board-portrait-w",
      "black-gold-board.html",
    ])
      assert.ok(!text.includes(token), "Development preview leaked into " + f);
  }
}
console.log(
  JSON.stringify({
    productionPreviewExcluded: true,
    filesInspected: files.length,
    productionDeployment: false,
  }),
);
