import { productionSettings, protectedBuildCommand } from "./configuration.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { verifyRelease } from "./verify-release.mjs";
import { assertForwardRelease } from "./release.mjs";
function fixture(run) {
  const cwd = mkdtempSync(join(tmpdir(), "ko-release-"));
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  try {
    git("init");
    git("config", "user.email", "release-test@example.invalid");
    git("config", "user.name", "Release Test");
    writeFileSync(join(cwd, "file"), "old");
    git("add", ".");
    git("commit", "-m", "old");
    const old = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "file"), "current");
    git("commit", "-am", "current");
    const current = git("rev-parse", "HEAD");
    writeFileSync(join(cwd, "file"), "new");
    git("commit", "-am", "new");
    const next = git("rev-parse", "HEAD");
    return run({ cwd, git, old, current, next });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}
test("current and newer descendants pass; old source fails closed", () =>
  fixture(({ cwd, git, old, current, next }) => {
    assert.equal(
      verifyRelease({ cwd, minimumCommit: current, revision: next }).verified,
      true,
    );
    git("checkout", current);
    assert.equal(
      verifyRelease({ cwd, minimumCommit: current, revision: current })
        .verified,
      true,
    );
    git("checkout", old);
    assert.throws(
      () => verifyRelease({ cwd, minimumCommit: current, revision: old }),
      /older than/,
    );
  }));
test("checkout mismatch, unavailable floor and invalid hashes fail", () =>
  fixture(({ cwd, old, current, next }) => {
    assert.throws(
      () => verifyRelease({ cwd, minimumCommit: current, revision: old }),
      /differs/,
    );
    assert.throws(
      () =>
        verifyRelease({ cwd, minimumCommit: "f".repeat(40), revision: next }),
      /older than/,
    );
    assert.throws(
      () => verifyRelease({ cwd, minimumCommit: "HEAD" }),
      /Invalid/,
    );
  }));
test("live revision can only move forward, never backwards or onto unrelated history", () =>
  fixture(({ cwd, git, old, current, next }) => {
    assertForwardRelease(cwd, current, next);
    assert.throws(() => assertForwardRelease(cwd, next, current), /refused/);
    git("checkout", "--orphan", "unrelated");
    git("add", ".");
    git("commit", "-m", "unrelated");
    assert.throws(
      () => assertForwardRelease(cwd, current, git("rev-parse", "HEAD")),
      /refused/,
    );
    assert.throws(() => assertForwardRelease(cwd, undefined, next), /refused/);
  }));
test("old commits without the guard cannot execute the protected build entrypoint", () =>
  fixture(({ cwd }) => {
    const result = spawnSync(
      process.execPath,
      ["scripts/deploy/verify-release.mjs"],
      { cwd, encoding: "utf8" },
    );
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /MODULE_NOT_FOUND/);
  }));

test("Render settings use production and an externally pinned advancing floor", () => {
  const floor = "a".repeat(40),
    next = "b".repeat(40);
  for (const role of ["api", "front"]) {
    const config = productionSettings(role, floor);
    assert.equal(config.branch, "production");
    assert.equal(config.autoDeploy, "no");
    assert.ok(
      protectedBuildCommand(role, floor).startsWith(
        `node scripts/deploy/verify-release.mjs --minimum-commit ${floor} && `,
      ),
    );
    assert.notEqual(
      protectedBuildCommand(role, floor),
      protectedBuildCommand(role, next),
    );
  }
  assert.throws(() => productionSettings("api", "HEAD"), /Invalid/);
});
