/** Read-only verification: API-only release with unchanged browser protocol/assets. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { render, SERVICES } from "../../scripts/deploy/release.mjs";
const apiRevision = process.argv[2];
const frontRevision = process.argv[3];
for (const value of [apiRevision, frontRevision])
  assert.match(value, /^[a-f0-9]{40}$/);
const observations = [];
for (const [role, id] of Object.entries(SERVICES)) {
  const expected = role === "api" ? apiRevision : frontRevision;
  const live = (await render(`services/${id}/deploys?limit=5`)).find(
    (entry) => entry.deploy.status === "live",
  )?.deploy;
  assert.equal(live?.commit?.id, expected);
  const config = await render(`services/${id}`);
  assert.equal(config.branch, "production");
  assert.equal(config.autoDeploy, "no");
  const build =
    config.serviceDetails.buildCommand ??
    config.serviceDetails.envSpecificDetails?.buildCommand ??
    "";
  assert.ok(build.includes(expected));
  observations.push({
    role,
    commit: expected,
    deployId: live.id,
    status: live.status,
  });
}
async function get(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, url);
  return response;
}
const api = "https://ko-card-game.onrender.com";
assert.equal(
  (await get(api + "/api/healthz").then((r) => r.json())).revision,
  apiRevision,
);
for (const resource of ["cards", "champions"]) {
  const payload = await get(`${api}/api/${resource}`).then((r) => r.json());
  assert.ok(Array.isArray(payload[resource]) && payload[resource].length > 0);
  observations.push({ resource, records: payload[resource].length });
}
const front = "https://ko-card-game-vr69.onrender.com";
assert.equal(
  (await get(front + "/version.json").then((r) => r.json())).revision,
  frontRevision,
);
for (const path of ["/", "/admin/champions"]) {
  const html = await get(front + path).then((r) => r.text());
  const entry = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1];
  assert.ok(entry);
  assert.ok(
    (await get(new URL(entry, front)).then((r) => r.text())).includes(
      frontRevision,
    ),
  );
  observations.push({ path, entry, revision: frontRevision });
}
const receipt = {
  checkedAt: new Date().toISOString(),
  apiRevision,
  frontRevision,
  apiOnlyRelease: true,
  observations,
  productionCombatActionsCreated: 0,
  productionMultiplayerLatencyMeasured: false,
};
await writeFile(
  process.env.KO_LATENCY_RELEASE_RECEIPT ??
    "docs/qa/20261111-multiplayer-latency/production-release.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
