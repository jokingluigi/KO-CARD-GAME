/** Self-contained isolated HTTP + WebSocket + Chromium integration run. No production connections. */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createWriteStream } from "node:fs";
const root = resolve("."),
  out = resolve("qa-results/cosmetics");
await mkdir(out, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "ko-cosmetics-"));
const draft = process.env.KO_COSMETICS_DRAFT === "1";
const prefix = draft ? "draft-" : "";
const fixturePort = Number(process.env.KO_COSMETICS_FIXTURE_PORT ?? 5187),
  frontendPort = Number(
    process.env.KO_COSMETICS_FRONTEND_PORT ?? (draft ? 5177 : 5176),
  );
const children = [];
function start(args, env, logName) {
  const log = createWriteStream(join(out, logName));
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}
function ready(child, needle) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Fixture readiness timeout: " + needle)),
      40000,
    );
    const data = (bytes) => {
      if (String(bytes).includes(needle)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", data);
    child.stderr.on("data", data);
    child.once("error", reject);
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Fixture exited before readiness: " + code));
    });
  });
}
try {
  const fixture = start(
    [
      "--import",
      "./docs/qa/checkpoints/20261006/qa-loader.mjs",
      "--test",
      "--test-isolation=none",
      draft ? "lib/db/qa/draft-http.test.ts" : "lib/db/qa/cosmetics.test.ts",
    ],
    {
      ...(draft
        ? { KO_DRAFT_COSMETICS_BROWSER_MODE: "1" }
        : { KO_COSMETICS_BROWSER_MODE: "1" }),
      KO_COSMETICS_FIXTURE_PORT: String(fixturePort),
    },
    prefix + "fixture.log",
  );
  await ready(
    fixture,
    draft ? "DRAFT_COSMETICS_READY" : "COSMETICS_BROWSER_READY",
  );
  const fixtureData = JSON.parse(
    await readFile(
      resolve(
        "qa-results/cosmetics/" +
          (draft ? "draft-fixture.json" : "fixture.json"),
      ),
      "utf8",
    ),
  );
  if (
    !["127.0.0.1", "localhost"].includes(new URL(fixtureData.origin).hostname)
  )
    throw new Error("Only isolated fixture servers are supported");
  const config = join(temp, "vite.config.mts");
  await writeFile(
    config,
    `import {mergeConfig} from ${JSON.stringify(pathToFileURL(resolve("artifacts/ko-game/node_modules/vite/dist/node/index.js")).href)};\nimport base from ${JSON.stringify(pathToFileURL(resolve("artifacts/ko-game/vite.config.ts")).href)};\nexport default mergeConfig(base,{cacheDir:${JSON.stringify(join(temp, "cache"))},server:{port:${frontendPort},host:'127.0.0.1',proxy:{'/api':{target:${JSON.stringify(fixtureData.origin)},ws:true}}}});\n`,
  );
  const vite = start(
    [
      resolve("artifacts/ko-game/node_modules/vite/bin/vite.js"),
      "--config",
      config,
    ],
    { PORT: String(frontendPort), BASE_PATH: "/" },
    prefix + "vite.log",
  );
  await ready(vite, "ready in");
  const run = start(
    [
      resolve(
        draft
          ? "docs/qa/cosmetics-draft-browser.mjs"
          : "docs/qa/cosmetics-browser.mjs",
      ),
    ],
    { KO_COSMETICS_FRONTEND: `http://127.0.0.1:${frontendPort}` },
    prefix + "browser.log",
  );
  run.stdout.pipe(process.stdout);
  run.stderr.pipe(process.stderr);
  const code = await new Promise((resolve, reject) => {
    run.once("error", reject);
    run.once("exit", resolve);
  });
  if (code !== 0) throw new Error("Cosmetics browser checks failed: " + code);
} finally {
  for (const child of children)
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      const kill = setTimeout(() => child.kill("SIGKILL"), 1500);
      await new Promise((r) =>
        child.once("exit", () => {
          clearTimeout(kill);
          r();
        }),
      );
    }
  await rm(temp, { recursive: true, force: true });
}
