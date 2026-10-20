/** Runs only loopback HTTP/PostgreSQL-compatible fixtures. Never writes to production. */
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
const root = resolve("."),
  out = resolve("qa-results/shop-decks"),
  temp = await mkdtemp(join(tmpdir(), "ko-shop-decks-"));
await mkdir(out, { recursive: true });
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
      () => reject(new Error("Readiness timeout: " + needle)),
      45000,
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
      reject(new Error("Early fixture exit " + code));
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
      "lib/db/qa/shop-decks.test.ts",
    ],
    { KO_SHOP_DECKS_BROWSER_MODE: "1", KO_SHOP_DECKS_FIXTURE_PORT: "5188" },
    "fixture.log",
  );
  await ready(fixture, "SHOP_DECKS_BROWSER_READY");
  const config = join(temp, "vite.config.mts");
  await writeFile(
    config,
    `import {mergeConfig} from ${JSON.stringify(pathToFileURL(resolve("artifacts/ko-game/node_modules/vite/dist/node/index.js")).href)};\nimport base from ${JSON.stringify(pathToFileURL(resolve("artifacts/ko-game/vite.config.ts")).href)};\nexport default mergeConfig(base,{cacheDir:${JSON.stringify(join(temp, "cache"))},server:{port:5178,host:'127.0.0.1',proxy:{'/api':{target:'http://127.0.0.1:5188',ws:true}}}});`,
  );
  const vite = start(
    [
      resolve("artifacts/ko-game/node_modules/vite/bin/vite.js"),
      "--config",
      config,
    ],
    { PORT: "5178", BASE_PATH: "/" },
    "vite.log",
  );
  await ready(vite, "ready in");
  const browser = start(
    [resolve("docs/qa/shop-decks-browser.mjs")],
    { KO_SHOP_DECKS_FRONTEND: "http://127.0.0.1:5178" },
    "browser.log",
  );
  browser.stdout.pipe(process.stdout);
  browser.stderr.pipe(process.stderr);
  const code = await new Promise((resolve, reject) => {
    browser.once("error", reject);
    browser.once("exit", resolve);
  });
  if (code !== 0) throw new Error("Shop decks browser failed: " + code);
} finally {
  for (const child of children)
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 1500);
      await new Promise((r) =>
        child.once("exit", () => {
          clearTimeout(timer);
          r();
        }),
      );
    }
  await rm(temp, { recursive: true, force: true });
}
