/** Run compiled UI and loopback-only fixtures. No production database connection. */
import { spawn } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
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
  child.qaName = name;
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
    let output = "";
    child.stdout.on("data", (x) => {
      output = (output + String(x)).slice(-16384);
      const plain = output.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
      if (plain.includes(needle)) {
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
    "auth-session-cold-browser",
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
} catch (error) {
  // Checks annotations remain available when GitHub blob log downloads are denied.
  for (const child of children.slice(-2)) {
    const detail = await readFile(
      join(out, child.qaName + ".log"),
      "utf8",
    ).catch(() => String(error));
    const tail = detail.slice(-6000);
    console.error(child.qaName + "\n" + tail);
    const escaped = tail
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.log(`::error title=Auth browser ${child.qaName}::${escaped}`);
  }
  throw error;
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
