/** Run compiled UI and loopback-only fixtures. No production database connection. */
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { resolve, join } from "node:path";
const root = resolve("."),
  out = resolve("qa-results/auth-startup"),
  children = [];
const port = Number(process.env.KO_AUTH_QA_PORT ?? 5181);
await mkdir(out, { recursive: true });
function start(args, env, name) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  const stream = createWriteStream(join(out, name + ".log"));
  child.stdout.pipe(stream);
  child.stderr.pipe(stream);
  return child;
}
function ready(child, needle) {
  return new Promise((yes, no) => {
    const timer = setTimeout(
      () => no(Error("Readiness timeout: " + needle)),
      60000,
    );
    child.stdout.on("data", (x) => {
      if (String(x).includes(needle)) {
        clearTimeout(timer);
        yes();
      }
    });
    child.once("error", no);
    child.once("exit", (code) => {
      clearTimeout(timer);
      no(Error("Early exit " + code));
    });
  });
}
function ended(child) {
  return new Promise((yes, no) => {
    child.once("error", no);
    child.once("exit", (code) =>
      code === 0 ? yes() : no(Error("Browser failed: " + code)),
    );
  });
}
try {
  const vite = start(
    [
      resolve("artifacts/ko-game/node_modules/vite/bin/vite.js"),
      "preview",
      "--config",
      resolve("artifacts/ko-game/vite.config.ts"),
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { PORT: String(port), BASE_PATH: "/" },
    "preview",
  );
  await ready(vite, "Local:");
  const env = {
    KO_QA_ORIGIN: `http://127.0.0.1:${port}`,
    KO_ADMIN_QA_ORIGIN: `http://127.0.0.1:${port}`,
  };
  const scripts = process.env.KO_AUTH_QA_SCRIPTS?.split(",") ?? [
    "auth-startup-recovery-browser",
    "auth-recovery-browser-20261014",
    "auth-restoration-browser",
    "entry-browser",
  ];
  for (const script of scripts) {
    await ended(
      start(
        [
          "--import",
          "./docs/qa/checkpoints/20261006/qa-loader.mjs",
          "docs/qa/" + script + ".mjs",
        ],
        env,
        script,
      ),
    );
    console.log("PASS " + script);
  }
  if (process.env.KO_AUTH_ADMIN_BROWSER !== "0") {
    const fixture = start(
      [
        "--import",
        "./docs/qa/checkpoints/20261006/qa-loader.mjs",
        "--test",
        "--test-isolation=none",
        "lib/db/qa/tower-v2-http.test.ts",
      ],
      { KO_TOWER_BROWSER_MODE: "1" },
      "admin-fixture",
    );
    await ready(fixture, "Tower browser fixture ready");
    for (const script of [
      "admin-console-menus-browser",
      "admin-console-editors-browser",
      "admin-console-guard-browser",
    ]) {
      await ended(
        start(
          [
            "--import",
            "./docs/qa/checkpoints/20261006/qa-loader.mjs",
            "docs/qa/" + script + ".mjs",
          ],
          env,
          script,
        ),
      );
      console.log("PASS " + script);
    }
  }
} finally {
  for (const child of children)
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timer = setTimeout(() => child.kill("SIGKILL"), 1500);
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
}
