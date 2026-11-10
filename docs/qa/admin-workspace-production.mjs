/** Read-only deployment receipts. Never edits production DB or creates matches. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { render, SERVICES } from "../../scripts/deploy/release.mjs";
const commit =
  process.argv[2] ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const services = [];
for (const [role, id] of Object.entries(SERVICES)) {
  const entries = await render("services/" + id + "/deploys?limit=10");
  const live = entries.find((e) => e.deploy.status === "live")?.deploy;
  assert.equal(live?.commit?.id, commit);
  const config = await render("services/" + id);
  assert.equal(config.branch, "production");
  assert.equal(config.autoDeploy, "no");
  assert.ok(
    (
      config.serviceDetails.buildCommand ??
      config.serviceDetails.envSpecificDetails?.buildCommand ??
      ""
    ).includes(commit),
  );
  services.push({
    role,
    id,
    deployId: live.id,
    status: live.status,
    commit: live.commit.id,
    branch: config.branch,
    autoDeploy: config.autoDeploy,
  });
}
async function get(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(response.status, 200);
  return response;
}
const api = await get(
  "https://ko-card-game.onrender.com/api/healthz?release=" + commit,
).then((r) => r.json());
const front = await get(
  "https://ko-card-game-vr69.onrender.com/version.json?release=" + commit,
).then((r) => r.json());
assert.equal(api.revision, commit);
assert.equal(front.revision, commit);
const index = await get("https://ko-card-game-vr69.onrender.com/");
assert.match(index.headers.get("cache-control") ?? "", /no-store/);
const html = await index.text();
const module = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1];
assert.ok(module);
const js = await get(
  new URL(module, "https://ko-card-game-vr69.onrender.com/").href,
).then((r) => r.text());
assert.ok(
  js.includes(commit),
  "actual root entry module must be the new release, not cached previous HTML",
);
const adminPage = await get(
  "https://ko-card-game-vr69.onrender.com/admin/champions",
);
const adminHTML = await adminPage.text();
const adminEntry = adminHTML.match(
  /<script[^>]+type="module"[^>]+src="([^"]+)"/i,
)?.[1];
assert.ok(adminEntry);
const adminJS = await get(
  new URL(adminEntry, "https://ko-card-game-vr69.onrender.com").href,
).then((r) => r.text());
assert.ok(adminJS.includes(commit));
const cards = await get(
  "https://ko-card-game.onrender.com/api/cards?release=" + commit,
).then((r) => r.json());
assert.ok(
  cards.cards
    .find((c) => c.id === "5f1fd584-7129-4f39-91a4-22f02ba677e5")
    ?.text.includes("하나라도"),
  "previous Helper healing patch remains live",
);
const tagCatalog = await get(
  "https://ko-card-game.onrender.com/api/card-tags?release=" + commit,
).then((r) => r.json());
assert.ok(
  tagCatalog.labels &&
    typeof tagCatalog.labels === "object" &&
    !Array.isArray(tagCatalog.labels),
);
const result = {
  checkedAtUTC: new Date().toISOString(),
  commit,
  services,
  api,
  front,
  rootEntryModule: module,
  rootCacheControl: index.headers.get("cache-control"),
  actualEntryContainsRevision: true,
  adminRouteEntryContainsRevision: true,
  adminRouteEntryModule: adminEntry,
  previousHelperPatchRetained: true,
  manualProductionDataWrites: 0,
  schemaChangedByThisRelease: false,
  scope:
    process.env.QA_RELEASE_SCOPE ??
    "admin-workspace-and-champion-preparation-editor",
  tagLabelsEndpointAvailable: true,
  productionMatchCreated: false,
  mainMerged: false,
};
await writeFile(
  process.env.QA_RELEASE_RECEIPT ??
    "docs/qa/20261110-admin-workspace/production-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
