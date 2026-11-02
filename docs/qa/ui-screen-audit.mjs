import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186";
const output = process.env.KO_AUDIT_OUT ?? "qa-results/ui-screen-audit-before";
await mkdir(output, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [390, 844],
    [1440, 1000],
  ])
    for (const path of [
      "/",
      "/online",
      "/online/quick",
      "/online/friendly",
      "/draft",
      "/shop",
      "/packs",
      "/attendance",
      "/daily-quests",
      "/player-notebook",
      "/decks",
      "/collection",
    ]) {
      const p = await b.newPage({
        viewport: { width, height },
        ignoreHTTPSErrors: origin.startsWith("https:"),
        reducedMotion: "reduce",
      });
      const errors = [];
      p.on("pageerror", (e) => errors.push(e.message));
      await auditSetup(p);
      await p.goto(origin + path);
      await p.waitForFunction(() =>
        [...document.querySelectorAll("main")].some(
          (n) =>
            !n.classList.contains("ko-loading-screen") &&
            !n.querySelector(".ko-loading-track"),
        ),
      );
      if (
        [
          "/attendance",
          "/daily-quests",
          "/shop",
          "/packs",
          "/player-notebook",
          "/draft",
        ].includes(path)
      ) {
        if (path === "/attendance")
          await p
            .getByRole("button", {
              name: "오늘 출석하고 보상 받기",
              exact: true,
            })
            .waitFor();
        else {
          const marker = {
            "/attendance": "+300 크레딧",
            "/daily-quests": "링 위의 첫 승리",
            "/shop": "KO 카드팩",
            "/packs": "KO 카드팩",
            "/player-notebook": "덱별 기록",
            "/draft": "AI 드래프트 시작",
          }[path];
          await p.getByText(marker, { exact: false }).first().waitFor();
        }
      }
      await p.waitForTimeout(150);
      await p.screenshot({
        path: `${output}/${path === "/" ? "home" : path.replaceAll("/", "_")}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
      results.push({
        width,
        height,
        path,
        overflow: await p.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        ),
        errors,
      });
      await p.close();
    }
  await writeFile(output + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
