import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const cache =
  process.env.KO_QA_RESOURCE_CACHE ?? ".local/qa/current-admin-resources";
const report = JSON.parse(
  fs.readFileSync(path.join(cache, "report.json"), "utf8"),
);
const browser = await chromium.launch({
  ...(process.env.KO_QA_CHROME_EXECUTABLE
    ? { executablePath: process.env.KO_QA_CHROME_EXECUTABLE }
    : { channel: "chrome" }),
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.route(report.sourceOrigin + "/api/storage/**", (route) => {
    const entry = report.results.find(
      (r) => r.path === new URL(route.request().url()).pathname,
    );
    return entry?.cacheFile
      ? route.fulfill({
          contentType: entry.mime,
          body: fs.readFileSync(path.join(cache, entry.cacheFile)),
        })
      : route.abort();
  });
  await page.goto("about:blank");
  const results = await page.evaluate(
    async ({ origin, resources }) => {
      const results = [];
      for (let offset = 0; offset < resources.length; offset += 8) {
        results.push(
          ...(await Promise.all(
            resources.slice(offset, offset + 8).map(async (r) => {
              try {
                if (r.mime.startsWith("image/")) {
                  const image = new Image();
                  image.src = origin + r.path;
                  await Promise.race([
                    image.decode(),
                    new Promise((_, reject) =>
                      setTimeout(() => reject(Error("timeout")), 15000),
                    ),
                  ]);
                  if (!image.naturalWidth || !image.naturalHeight)
                    throw Error("empty image");
                  return {
                    path: r.path,
                    type: "image",
                    passed: true,
                    width: image.naturalWidth,
                    height: image.naturalHeight,
                  };
                }
                const audio = document.createElement("audio");
                audio.preload = "metadata";
                await new Promise((resolve, reject) => {
                  const timer = setTimeout(
                    () => reject(Error("timeout")),
                    15000,
                  );
                  audio.onloadedmetadata = () => {
                    clearTimeout(timer);
                    resolve();
                  };
                  audio.onerror = () => {
                    clearTimeout(timer);
                    reject(Error("decode"));
                  };
                  audio.src = origin + r.path;
                });
                const duration = audio.duration;
                audio.removeAttribute("src");
                audio.load();
                if (!Number.isFinite(duration) || duration <= 0)
                  throw Error("empty audio");
                return { path: r.path, type: "audio", passed: true, duration };
              } catch (error) {
                return { path: r.path, passed: false, error: error.message };
              }
            }),
          )),
        );
      }
      return results;
    },
    { origin: report.sourceOrigin, resources: report.results },
  );
  const output = {
    checkedAt: new Date().toISOString(),
    method:
      "Browser decode of anonymously GET-fetched production content, isolated local cache; no account/session",
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    results,
  };
  fs.writeFileSync(
    path.join(cache, "browser-report.json"),
    JSON.stringify(output, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      total: output.total,
      passed: output.passed,
      images: results.filter((r) => r.type === "image").length,
      audio: results.filter((r) => r.type === "audio").length,
    }),
  );
  assert.equal(output.passed, output.total);
} finally {
  await browser.close();
}
