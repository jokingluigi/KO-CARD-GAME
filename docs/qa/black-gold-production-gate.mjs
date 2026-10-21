/** Production release gate: reviewed board included; QA scenes/legacy opt-in excluded. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
const root = "artifacts/ko-game/dist/public",
  files = [];
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
  assert.ok(!f.includes("/qa/black-gold"), "QA scene excluded");
  if (/\.(?:js|css|html)$/.test(f)) {
    const text = await readFile(f, "utf8");
    assert.ok(
      !text.includes("ko-dev-black-gold-board"),
      "Legacy development opt-in excluded",
    );
    assert.ok(
      !text.includes("black-gold-board.html"),
      "QA HTML entry excluded",
    );
  }
}
for (const variant of ["portrait", "wide"])
  assert.ok(
    files.some(
      (f) => f.includes("walnut-material-" + variant) && f.endsWith(".webp"),
    ),
    "Reviewed walnut " + variant + " material included",
  );
const css = (
  await Promise.all(
    files.filter((f) => f.endsWith(".css")).map((f) => readFile(f, "utf8")),
  )
).join("\n");
assert.ok(
  css.includes(".ko-game-shell.ko-board-preview"),
  "Shared board CSS included",
);
assert.ok(
  css.includes("linen-field") ||
    css.includes("Original linen") ||
    css.includes("Original%20linen"),
  "Beige linen included",
);
assert.ok(
  css.includes("black-linen") ||
    css.includes("Original matte black") ||
    css.includes("Original%20matte%20black"),
  "Black hand mat included",
);
console.log(
  JSON.stringify({
    productionBoardIncluded: true,
    qaSceneExcluded: true,
    legacyOptInExcluded: true,
    filesInspected: files.length,
  }),
);
