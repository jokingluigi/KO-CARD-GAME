/** Production GETs only; no account, match or card mutations. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { render, SERVICES } from "../../scripts/deploy/release.mjs";
import { cardRecordToDefinition } from "../../artifacts/ko-game/src/game/cards/published-cards.ts";
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
async function get(url) {
  const r = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(45000),
  });
  assert.equal(r.status, 200);
  return r.json();
}
const serviceChecks = [];
for (const [role, id] of Object.entries(SERVICES)) {
  const history = await render("services/" + id + "/deploys?limit=10");
  const live = history.find((e) => e.deploy.status === "live")?.deploy;
  assert.equal(live?.commit?.id, commit);
  const service = await render("services/" + id);
  assert.equal(service.branch, "production");
  assert.equal(service.autoDeploy, "no");
  serviceChecks.push({
    role,
    deployId: live.id,
    status: live.status,
    commit: live.commit.id,
  });
}
const api = await get(
  "https://ko-card-game.onrender.com/api/healthz?helper=" + commit,
);
const front = await get(
  "https://ko-card-game-vr69.onrender.com/version.json?helper=" + commit,
);
assert.equal(api.revision, commit);
assert.equal(front.revision, commit);
const body = await get(
  "https://ko-card-game.onrender.com/api/cards?helper=" + commit,
);
const helper = body.cards.find(
  (c) => c.id === "5f1fd584-7129-4f39-91a4-22f02ba677e5",
);
assert.ok(helper);
assert.ok(helper.text.includes("하나라도"));
const definition = cardRecordToDefinition(helper);
const trigger = definition.abilities.find((a) => a.trigger === "TURN_START");
assert.equal(trigger.condition?.type, "PREVIOUS_OWN_TURN_ANY_HEALED");
const result = {
  checkedAtUTC: new Date().toISOString(),
  commit,
  services: serviceChecks,
  api,
  front,
  publicHelper: {
    id: helper.id,
    name: helper.name,
    text: helper.text,
    updatedAt: helper.updatedAt,
  },
  runtimeCondition: trigger.condition.type,
  manualProductionDBWrites: 0,
  mainMerged: false,
  productionMatchCreated: false,
};
await writeFile(
  "docs/qa/20261110-helper-either-healing/production-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log(JSON.stringify(result));
