/** Read-only production receipt: exact deployed code and exact registered frame bytes. */
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const receipt =
  "docs/qa/20261111-registered-preview/production-verification.json";
process.env.QA_RELEASE_RECEIPT = receipt;
process.env.QA_RELEASE_SCOPE = "registered-frame-preview";
process.env.QA_ALLOW_MAINTENANCE = "1";
await import("./admin-workspace-production.mjs");
const result = JSON.parse(await readFile(receipt, "utf8")),
  catalog = JSON.parse(
    await readFile("artifacts/ko-game/qa/art-direction-data.json", "utf8"),
  ),
  assets = [];
for (const frame of catalog["card-frames"].frames) {
  if (!["NORMAL", "EPIC", "LEGENDARY", "CHAMPION"].includes(frame.rarity))
    continue;
  const file = `docs/qa/20261111-registered-preview/assets/${frame.cardType}-${frame.rarity}.png`;
  let expected;
  try {
    expected = await readFile(file);
  } catch {
    continue;
  }
  const r = await fetch(frame.frameUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(r.status, 200);
  const data = Buffer.from(await r.arrayBuffer());
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  assert.equal(sha(data), sha(expected));
  assets.push({
    cardType: frame.cardType,
    rarity: frame.rarity,
    url: frame.frameUrl,
    status: r.status,
    sha256: sha(data),
    matchesTestedAsset: true,
  });
}
assert.equal(assets.length, 6);
const status = await fetch(
  "https://ko-card-game.onrender.com/api/server-status",
  { cache: "no-store" },
).then((r) => r.json());
result.registeredAssets = assets;
result.maintenanceEnabled = status.enabled;
result.productionUploadPerformed = false;
await writeFile(receipt, JSON.stringify(result, null, 2) + "\n");
console.log(
  JSON.stringify({
    registeredAssetChecks: assets.length,
    maintenanceEnabled: status.enabled,
  }),
);
