/** Read-only release verification, including delayed static-route propagation. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { render, SERVICES } from "../../scripts/deploy/release.mjs";
const commit = process.argv[2];
assert.match(commit, /^[0-9a-f]{40}$/);
const root = "https://ko-card-game-vr69.onrender.com",
  observations = [];
async function get(path) {
  const r = await fetch(new URL(path, root), {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw Error(path + ": " + r.status);
  return r;
}
const services = [];
for (const [role, id] of Object.entries(SERVICES)) {
  const live = (await render("services/" + id + "/deploys?limit=5")).find(
    (x) => x.deploy.status === "live",
  )?.deploy;
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
  });
}
let serving;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const v = await get("/version.json").then((r) => r.json());
    const documents = await Promise.all(
      ["/", "/admin/champions"].map(async (path) => {
        const r = await get(path),
          html = await r.text(),
          entry = html.match(
            /<script[^>]+type="module"[^>]+src="([^"]+)"/i,
          )?.[1];
        const js = entry ? await get(entry).then((r) => r.text()) : "";
        return {
          path,
          entry,
          current: js.includes(commit),
          cacheControl: r.headers.get("cache-control"),
          js,
        };
      }),
    );
    const entryCurrent = documents.every((d) => d.current);
    observations.push({
      at: new Date().toISOString(),
      version: v.revision,
      root: documents[0].current,
      admin: documents[1].current,
    });
    console.log(JSON.stringify(observations.at(-1)));
    if (v.revision === commit && entryCurrent) {
      serving = { version: v, documents };
      break;
    }
  } catch (e) {
    observations.push({ at: new Date().toISOString(), error: e.message });
    console.log(JSON.stringify(observations.at(-1)));
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
}
assert.ok(
  serving,
  "actual public routes did not converge to the deployed source",
);
const js = serving.documents[0].js,
  modules = [...js.matchAll(/(?:assets\/|\.\/)([\w-]+\.js)/g)].map((m) => m[1]);
const engine = modules.find((x) => /^awakening-[A-Za-z0-9_-]{8}\.js$/.test(x));
assert.ok(engine);
assert.ok(
  (await get("/assets/" + engine).then((r) => r.text())).includes(
    "pinfallEligible",
  ),
  "delivered engine has source eligibility snapshot",
);
const api = await fetch("https://ko-card-game.onrender.com/api/healthz", {
  cache: "no-store",
  signal: AbortSignal.timeout(20000),
}).then((r) => r.json());
assert.equal(api.revision, commit);
const result = {
  checkedAtUTC: new Date().toISOString(),
  commit,
  services,
  api,
  frontend: serving.version,
  documents: serving.documents.map(({ js, ...d }) => d),
  engineModule: engine,
  eligibilitySnapshotInDeliveredEngine: true,
  observations,
  productionDataWrites: 0,
  productionMatchCreated: false,
  schemaChanged: false,
  mainMerged: false,
};
await writeFile(
  process.env.QA_RELEASE_RECEIPT ??
    "docs/qa/20261111-pinfall-sources/production-verification.json",
  JSON.stringify(result, null, 2) + "\n",
);
console.log("VERIFIED " + commit);
