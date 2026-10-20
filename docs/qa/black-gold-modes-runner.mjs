/** Reuse existing real HTTP/WebSocket regressions in separate PGlite databases and output folders. */
import {
  readFile,
  writeFile,
  mkdir,
  unlink,
  mkdtemp,
  rm,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
const boardOrigin = process.env.KO_BOARD_ORIGIN ?? "http://127.0.0.1:5186";
if (!["localhost", "127.0.0.1"].includes(new URL(boardOrigin).hostname))
  throw Error("Only isolated loopback preview servers are supported");
const browserEnv = {
  ...process.env,
  KO_QA_PLAYWRIGHT: resolve("docs/qa/black-gold-playwright.mjs"),
  KO_QA_BOARD_BASE_PLAYWRIGHT:
    process.env.KO_QA_PLAYWRIGHT ??
    "/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs",
};
const mode = process.argv[2] ?? "pvp";
if (!["pvp", "draft", "tower"].includes(mode))
  throw Error("pvp, draft or tower required");
const temp = await mkdtemp(join(tmpdir(), "ko-board-modes-")),
  tag = randomUUID(),
  draft = mode === "draft";
const output =
  (process.env.KO_BOARD_MODES_OUTPUT ?? "qa-results/black-gold-modes") +
  "/" +
  mode;
await mkdir(output, { recursive: true });
const fixtureSource =
  mode === "tower"
    ? "lib/db/qa/tower-v2-http.test.ts"
    : draft
      ? "lib/db/qa/draft-http.test.ts"
      : "lib/db/qa/cosmetics.test.ts";
const children = [];
const fixture = resolve("lib/db/qa/.black-gold-" + tag + ".test.ts");
try {
  let fixtureCode = (await readFile(fixtureSource, "utf8"))
    .replaceAll("qa-results/cosmetics", output)
    .replaceAll("qa-results/tower-v2", output);
  if (mode === "tower")
    fixtureCode = fixtureCode.replace(
      'if (process.env.KO_TOWER_BROWSER_MODE === "1") {',
      'if (process.env.KO_TOWER_BROWSER_MODE === "1") { await ok("admin", "/admin/tower/settings", "PUT", {enabled:true}); const previewRun=await start("user-a"); if(previewRun.phase==="DIALOGUE")await command("user-a",previewRun,{type:"DIALOGUE_SKIP"});',
    );
  await writeFile(fixture, fixtureCode);
  if (mode === "tower") {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "./docs/qa/checkpoints/20261006/qa-loader.mjs",
        "--test",
        "--test-isolation=none",
        fixture,
      ],
      {
        cwd: resolve("."),
        env: { ...process.env, KO_TOWER_BROWSER_MODE: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    children.push(child);
    const log = createWriteStream(output + "/fixture.log");
    child.stdout.pipe(log);
    child.stderr.pipe(log);
    await new Promise((yes, no) => {
      let text = "";
      const timer = setTimeout(() => no(Error("Tower fixture timeout")), 60000);
      child.stdout.on("data", (x) => {
        text += x;
        if (text.includes("Tower browser fixture ready")) {
          clearTimeout(timer);
          yes();
        }
      });
      child.once("error", no);
      child.once("exit", () => no(Error("Tower fixture exited")));
    });
    let code = await readFile("docs/qa/tower-v2-browser-battle.mjs", "utf8");
    code =
      `import assert from "node:assert/strict";
` + code;
    code = code.replaceAll("qa-results/tower-v2", output);
    code = code.replace(
      'await page.locator(".ko-hand-card").first().click();',
      `await page.locator(".ko-board-preview").waitFor();
       assert.equal(await page.locator('.ko-game-controls [aria-label^="남은 턴 시간"]').count(),0);
       await page.locator(".ko-hand-card").first().click();`,
    );
    await writeFile(join(temp, "tower.mjs"), code);
    const run = spawn(process.execPath, [join(temp, "tower.mjs")], {
      env: {
        ...browserEnv,
        KO_QA_ORIGIN: boardOrigin,
      },
      stdio: "inherit",
    });
    const status = await new Promise((yes, no) => {
      run.once("error", no);
      run.once("exit", yes);
    });
    if (status !== 0) throw Error("Tower browser failed");
  } else {
    let browser = await readFile(
      draft
        ? "docs/qa/cosmetics-draft-browser.mjs"
        : "docs/qa/cosmetics-browser.mjs",
      "utf8",
    );
    browser = browser.replaceAll("qa-results/cosmetics", output).replaceAll(
      "await task();",
      `await task();
        for(const c of browser.contexts())for(const p of c.pages())
          if(await p.locator(".ko-game-shell").count())
            assert.equal(await p.locator(".ko-board-preview").count(),1,"development theme active on actual battle");`,
    );
    // Assert the opt-in on actual matched battle boards as well as existing protocol assertions.
    browser = browser.replaceAll(
      'await page.goto(origin + "/draft/match/" + fixture.id);',
      'await page.goto(origin + "/draft/match/" + fixture.id); await page.locator(".ko-board-preview").waitFor();',
    );
    await writeFile(join(temp, "browser.mjs"), browser);
    let runner = await readFile("docs/qa/cosmetics-browser-runner.mjs", "utf8");
    runner = runner
      .replaceAll("qa-results/cosmetics", output)
      .replaceAll(fixtureSource, fixture)
      .replaceAll(
        draft
          ? "docs/qa/cosmetics-draft-browser.mjs"
          : "docs/qa/cosmetics-browser.mjs",
        join(temp, "browser.mjs"),
      );
    await writeFile(join(temp, "run.mjs"), runner);
    const child = spawn(process.execPath, [join(temp, "run.mjs")], {
      cwd: resolve("."),
      env: {
        ...browserEnv,
        NO_COLOR: "1",
        KO_COSMETICS_DRAFT: draft ? "1" : "0",
        KO_COSMETICS_FIXTURE_PORT: draft ? "5195" : "5193",
        KO_COSMETICS_FRONTEND_PORT: draft ? "5194" : "5192",
      },
      stdio: "inherit",
    });
    const code = await new Promise((yes, no) => {
      child.once("error", no);
      child.once("exit", yes);
    });
    if (code !== 0) throw Error("Mode browser failed: " + code);
  }
} finally {
  for (const c of children) if (c.exitCode === null) c.kill("SIGTERM");
  await unlink(fixture).catch(() => {});
  await rm(temp, { recursive: true, force: true });
}
