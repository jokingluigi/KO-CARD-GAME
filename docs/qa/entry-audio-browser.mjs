import fs from "node:fs/promises";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({
  headless: true,
  channel: process.env.KO_QA_CHROME_CHANNEL ?? "chrome",
  args: ["--autoplay-policy=user-gesture-required"],
});
const origin = process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:17998";
const wav = Buffer.alloc(44 + 16000 * 2 * 3);
wav.write("RIFF");
wav.writeUInt32LE(wav.length - 8, 4);
wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16);
wav.writeUInt16LE(1, 20);
wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(16000, 24);
wav.writeUInt32LE(32000, 28);
wav.writeUInt16LE(2, 32);
wav.writeUInt16LE(16, 34);
wav.write("data", 36);
wav.writeUInt32LE(wav.length - 44, 40);
for (let i = 0; i < (wav.length - 44) / 2; i++)
  wav.writeInt16LE(
    Math.round(Math.sin((i * 2 * Math.PI * 220) / 16000) * 2000),
    44 + i * 2,
  );
const results = [];
try {
  for (const mobile of [false, true])
    for (const muted of [false, true]) {
      const context = await browser.newContext({
        viewport: mobile
          ? { width: 390, height: 844 }
          : { width: 1280, height: 800 },
        isMobile: mobile,
        hasTouch: mobile,
      });
      await context.addInitScript(
        ({ muted }) => {
          localStorage.setItem("ko-game-bgm-muted-v2", String(muted));
          window.__entryAudio = [];
          const Native = window.Audio;
          window.Audio = function (...args) {
            const a = new Native(...args);
            window.__entryAudio.push(a);
            return a;
          };
          window.Audio.prototype = Native.prototype;
        },
        { muted },
      );
      const page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("**/qa-entry.wav", (r) =>
        r.fulfill({ contentType: "audio/wav", body: wav }),
      );
      await page.route("https://fonts.**", (r) => r.abort());
      await page.route("**/api/**", async (r) => {
        const path = new URL(r.request().url()).pathname;
        if (path.endsWith("/auth/me")) {
          await new Promise((resolve) => setTimeout(resolve, 650));
          return r.fulfill({
            json: {
              authenticated: true,
              user: {
                id: "entry-bgm",
                email: "bgm@example.invalid",
                nickname: "BGM_QA",
                role: "USER",
                currency: 0,
                currencyBalance: 0,
                prismBalance: 0,
                championPrismBalance: 0,
              },
            },
          });
        }
        if (path.endsWith("/server-status"))
          return r.fulfill({
            json: { enabled: false, allowed: true, message: "" },
          });
        if (path.endsWith("/main-content"))
          return r.fulfill({
            json: {
              notices: [],
              background: null,
              bgm: {
                id: "entry-track",
                assetUrl: origin + "/qa-entry.wav",
                volume: 70,
              },
            },
          });
        if (path.endsWith("/cards")) return r.fulfill({ json: { cards: [] } });
        if (path.endsWith("/champions"))
          return r.fulfill({ json: { champions: [] } });
        if (path.endsWith("/availability"))
          return r.fulfill({ json: { available: false } });
        return r.fulfill({ json: {} });
      });
      await page.goto(origin + "/", { waitUntil: "domcontentloaded" });
      await page.getByText("BGM_QA", { exact: true }).waitFor();
      if (mobile) await page.getByText("BGM_QA", { exact: true }).tap();
      else await page.getByText("BGM_QA", { exact: true }).click();
      if (!muted)
        await page.waitForFunction(() =>
          window.__entryAudio.some(
            (a) =>
              a.src.includes("qa-entry.wav") &&
              !a.paused &&
              a.currentTime > 0.05,
          ),
        );
      else {
        await page.waitForTimeout(200);
        if (
          await page.evaluate(() =>
            window.__entryAudio.some(
              (a) =>
                a.src.includes("qa-entry.wav") &&
                !a.paused &&
                !a.muted &&
                a.volume > 0,
            ),
          )
        )
          throw Error("mute ignored");
      }
      if (errors.length) throw Error(errors.join("\n"));
      results.push({ mobile, muted, passed: true });
      await context.close();
    }
  await fs.mkdir("qa-results/entry-audio", { recursive: true });
  await fs.writeFile(
    "qa-results/entry-audio/result.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
} finally {
  await browser.close();
}
