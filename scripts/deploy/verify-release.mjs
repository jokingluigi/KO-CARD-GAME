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
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const index = process.argv.indexOf("--minimum-commit");
    const minimumCommit = index < 0 ? RECOVERY_FLOOR : process.argv[index + 1];
    console.log(
      JSON.stringify(verifyRelease({ minimumCommit, fetchHistory: true })),
    );
  } catch (error) {
    console.error("PRODUCTION RELEASE BLOCKED: " + error.message);
    process.exitCode = 1;
  }
}
