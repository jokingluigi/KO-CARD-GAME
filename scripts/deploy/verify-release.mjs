import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
export const RECOVERY_FLOOR = "ce5568d955171b32719b24cabb2c7937b8da165f";
const fullCommit = (value) =>
  typeof value === "string" && /^[0-9a-f]{40}$/.test(value);
function git(cwd, args) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    timeout: 45000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export function isAncestor(cwd, ancestor, revision) {
  if (!fullCommit(ancestor) || !fullCommit(revision))
    throw Error("A full immutable commit is required.");
  return (
    git(cwd, ["merge-base", "--is-ancestor", ancestor, revision]).status === 0
  );
}
export function verifyRelease({
  cwd = process.cwd(),
  minimumCommit = RECOVERY_FLOOR,
  revision = process.env.RENDER_GIT_COMMIT,
  fetchHistory = false,
} = {}) {
  if (!fullCommit(minimumCommit))
    throw Error("Invalid minimum production revision.");
  const head = git(cwd, ["rev-parse", "HEAD"]);
  if (head.status !== 0)
    throw Error("Cannot identify checked-out source; refusing deployment.");
  const actual = head.stdout.trim();
  if (!fullCommit(actual) || (revision !== undefined && actual !== revision))
    throw Error("Checkout differs from the requested deployment commit.");
  if (!isAncestor(cwd, minimumCommit, actual) && fetchHistory) {
    const fetched = git(cwd, [
      "fetch",
      "--no-tags",
      "--deepen=128",
      "origin",
      actual,
      minimumCommit,
    ]);
    if (fetched.status !== 0)
      throw Error("Cannot verify production ancestry; refusing deployment.");
  }
  if (!isAncestor(cwd, minimumCommit, actual))
    throw Error(
      "Release is older than or unrelated to the protected production baseline.",
    );
  return { revision: actual, minimumCommit, verified: true };
}
export async function verifyHostedRelease({
  cwd = process.cwd(),
  minimumCommit = RECOVERY_FLOOR,
  revision = process.env.RENDER_GIT_COMMIT,
  compare = compareOnGitHub,
} = {}) {
  if (!fullCommit(minimumCommit) || !fullCommit(revision))
    throw Error("Invalid hosted production revision.");
  const head = git(cwd, ["rev-parse", "HEAD"]);
  if (head.status === 0 && head.stdout.trim() !== revision)
    throw Error("Checkout differs from the requested deployment commit.");
  if (head.status === 0 && isAncestor(cwd, minimumCommit, revision))
    return { revision, minimumCommit, verified: true, verification: "git" };
  const result = await compare(minimumCommit, revision);
  if (
    !["ahead", "identical"].includes(result.status) ||
    result.merge_base_commit?.sha !== minimumCommit ||
    (result.status === "identical"
      ? revision !== minimumCommit
      : result.commits?.at(-1)?.sha !== revision)
  )
    throw Error(
      "Hosted release is older than or unrelated to the protected production baseline.",
    );
  return {
    revision,
    minimumCommit,
    verified: true,
    verification: "github-ancestry",
  };
}
async function compareOnGitHub(minimumCommit, revision) {
  const response = await fetch(
    `https://api.github.com/repos/jokingluigi/KO-CARD-GAME/compare/${minimumCommit}...${revision}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "KO-Production-Release-Guard",
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (!response.ok)
    throw Error("Cannot verify hosted source ancestry; refusing deployment.");
  return response.json();
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const index = process.argv.indexOf("--minimum-commit");
    const minimumCommit = index < 0 ? RECOVERY_FLOOR : process.argv[index + 1];
    const result = process.env.RENDER_GIT_COMMIT
      ? await verifyHostedRelease({ minimumCommit })
      : verifyRelease({ minimumCommit, fetchHistory: true });
    console.log(JSON.stringify(result));
  } catch (error) {
    console.error("PRODUCTION RELEASE BLOCKED: " + error.message);
    process.exitCode = 1;
  }
}
