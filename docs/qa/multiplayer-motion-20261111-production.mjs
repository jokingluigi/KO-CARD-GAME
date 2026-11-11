/** Read-only API hotfix + frontend serving verification. No match creation. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { render, SERVICES } from "../../scripts/deploy/release.mjs";
const expected = { api: process.argv[2], front: process.argv[3] };
for (const revision of Object.values(expected))
  assert.match(revision, /^[a-f0-9]{40}$/);
const observations = [];
async function get(url) {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  assert.equal(response.status, 200, url);
  return response;
}
for (const [role, id] of Object.entries(SERVICES)) {
  const live = (await render(`services/${id}/deploys?limit=5`)).find(
    (x) => x.deploy.status === "live",
  )?.deploy;
  assert.equal(live?.commit?.id, expected[role]);
  const config = await render(`services/${id}`);
  assert.equal(config.branch, "production");
  assert.equal(config.autoDeploy, "no");
  assert.ok(
    (
      config.serviceDetails.buildCommand ??
      config.serviceDetails.envSpecificDetails?.buildCommand ??
      ""
    ).includes(expected[role]),
  );
  observations.push({
    role,
    commit: live.commit.id,
    deployId: live.id,
    status: live.status,
  });
}
const api = "https://ko-card-game.onrender.com",
  front = "https://ko-card-game-vr69.onrender.com";
assert.equal(
  (await get(api + "/api/healthz").then((r) => r.json())).revision,
  expected.api,
);
const champions = await get(api + "/api/champions").then((r) => r.json());
const pandora = champions.champions.find(
  (c) => c.id === "bcffab96-f61f-497e-b60b-de5a869837d3",
);
assert.ok(pandora);
observations.push({
  champion: pandora.name,
  version: pandora.version,
  abilityText: pandora.abilityText,
});
let serving;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    assert.equal(
      (await get(front + "/version.json").then((r) => r.json())).revision,
      expected.front,
    );
    const paths = [];
    let main;
    for (const path of [
      "/",
      "/admin/champions",
      "/online/match/release-check",
    ]) {
      const html = await get(front + path).then((r) => r.text());
      const entry = html.match(
        /<script[^>]+type="module"[^>]+src="([^"]+)"/i,
      )?.[1];
      assert.ok(entry);
      const js = await get(new URL(entry, front)).then((r) => r.text());
      assert.ok(js.includes(expected.front), path + " entry revision");
      main = js;
      paths.push({ path, entry });
    }
    const onlineChunk = main.match(
      /assets\/online-match-(?!intro-)[a-zA-Z0-9_-]+\.js/,
    )?.[0];
    assert.ok(onlineChunk);
    assert.ok(
      (
        await get(new URL(onlineChunk, front + "/")).then((r) => r.text())
      ).includes("requestIdleCallback"),
    );
    serving = { paths, onlineChunk };
    break;
  } catch (error) {
    console.log(
      JSON.stringify({
        attempt,
        waitingForServingRevision: true,
        error: error.message,
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}
assert.ok(serving, "Actual browser routes did not propagate the release");
const receipt = {
  checkedAt: new Date().toISOString(),
  expected,
  observations,
  serving,
  productionCombatActionsCreated: 0,
  productionMultiplayerFrameRateMeasured: false,
};
await writeFile(
  "docs/qa/20261111-multiplayer-motion/production-release.json",
  JSON.stringify(receipt, null, 2) + "\n",
);
console.log(JSON.stringify(receipt));
