import { productionSettings } from "./configuration.mjs";
/** Explicit, fast-forward-only deployment. No database writes or main merge. */
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { verifyRelease, isAncestor } from "./verify-release.mjs";
export const SERVICES = {
  api: "srv-daml9kqd0e5s73fsnjs0",
  front: "srv-damlm4gu01pc73ao3mb0",
};
export function assertForwardRelease(cwd, current, target) {
  if (!current || !isAncestor(cwd, current, target))
    throw Error(
      "Target does not contain the current live release; deployment refused.",
    );
}
export async function render(path, { method = "GET", body } = {}) {
  if (!process.env.RENDER_API_KEY) throw Error("RENDER_API_KEY is required.");
  const response = await fetch("https://api.render.com/v1/" + path, {
    method,
    headers: {
      Authorization: "Bearer " + process.env.RENDER_API_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(45000),
  });
  if (!response.ok)
    throw Error("Render request failed with status " + response.status);
  return response.json();
}
export async function deploy(role, commit) {
  const sid = SERVICES[role];
  if (!sid) throw Error("Choose api or front.");
  verifyRelease({ revision: commit });
  const remote = spawnSync(
    "git",
    ["ls-remote", "origin", "refs/heads/production"],
    { encoding: "utf8", timeout: 30000 },
  );
  if (remote.status !== 0 || remote.stdout.split(/\s+/)[0] !== commit)
    throw Error("Commit must exactly match the published production branch.");
  const service = await render("services/" + sid);
  if (service.branch !== "production" || service.autoDeploy !== "no")
    throw Error("Unexpected production branch/deployment settings.");
  const history = await render("services/" + sid + "/deploys?limit=30");
  if (
    history.some((entry) =>
      [
        "created",
        "queued",
        "build_in_progress",
        "update_in_progress",
        "pre_deploy_in_progress",
      ].includes(entry.deploy.status),
    )
  )
    throw Error("Another deployment is in progress.");
  const live = history.find((entry) => entry.deploy.status === "live")?.deploy;
  if (!live?.commit?.id)
    throw Error("Cannot establish the current live revision.");
  assertForwardRelease(process.cwd(), live.commit.id, commit);
  const started = await render("services/" + sid + "/deploys", {
    method: "POST",
    body: { commitId: commit, clearCache: "do_not_clear" },
  });
  console.log(
    JSON.stringify({
      role,
      deployId: started.id,
      commit,
      previousLiveCommit: live.commit.id,
      status: started.status,
    }),
  );
  const deadline = Date.now() + 20 * 60 * 1000;
  while (Date.now() < deadline) {
    await delay(8000);
    const d = await render("services/" + sid + "/deploys/" + started.id);
    if (
      [
        "build_failed",
        "update_failed",
        "pre_deploy_failed",
        "canceled",
        "deactivated",
      ].includes(d.status)
    )
      throw Error("Deployment stopped: " + d.status);
    if (d.status === "live") {
      if (d.commit?.id !== commit)
        throw Error("Live commit differs from the requested revision.");
      const endpoint =
        role === "api"
          ? "https://ko-card-game.onrender.com/api/healthz"
          : "https://ko-card-game-vr69.onrender.com/version.json";
      let verified = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        const response = await fetch(endpoint + "?release=" + commit, {
          cache: "no-store",
          signal: AbortSignal.timeout(20000),
        });
        if (response.ok) {
          const actual = await response.json();
          if (actual.revision === commit) {
            verified = true;
            break;
          }
        }
        await delay(3000);
      }
      if (!verified)
        throw Error(
          "Public serving revision does not match the live deployment.",
        );
      await render("services/" + sid, {
        method: "PATCH",
        body: productionSettings(role, commit),
      });
      console.log(
        JSON.stringify({
          role,
          deployId: d.id,
          commit,
          status: "live",
          publicRevisionVerified: true,
        }),
      );
      return d;
    }
  }
  throw Error("Deployment not confirmed live within 20 minutes.");
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  deploy(process.argv[2], process.argv[3]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
