import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
import { mkdir, writeFile } from "node:fs/promises";
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186";
const out =
  process.env.KO_QUALITY_AUDIT_OUT ?? "qa-results/quality-surface-audit";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [],
  allErrors = [];
for (const [w, h] of process.env.KO_QUALITY_AUDIT_MOBILE === "1"
  ? [[390, 844]]
  : [
      [390, 844],
      [844, 390],
      [1440, 900],
    ]) {
  const p = await b.newPage({
    viewport: { width: w, height: h },
    reducedMotion: "reduce",
    ignoreHTTPSErrors: true,
  });
  await auditSetup(p);
  const errors = [];
  p.on("pageerror", (e) =>
    allErrors.push({ url: p.url(), message: e.message }),
  );
  for (const [path, title] of [
    ["/", ""],
    ["/online", "대전 모드"],
    ["/decks", "덱 편집"],
    ["/collection", "내 컬렉션"],
    ["/cosmetics", ""],
    ["/shop", "상점"],
    ["/packs", "내 팩"],
    ["/settings", "설정"],
    ["/guide", "게임 규칙"],
    ["/player-notebook", "내 기록"],
  ]) {
    await p.goto(origin + path);
    if (title)
      await p
        .getByRole("heading", { name: title, exact: true })
        .first()
        .waitFor();
    else if (path === "/")
      await p.getByText("출전 검증 덱", { exact: true }).waitFor();
    else await p.getByRole("heading").first().waitFor();
    await p
      .locator(
        path === "/"
          ? ".ko-home-learning"
          : path === "/decks"
            ? "[data-testid=grid-card-collection]"
            : path === "/cosmetics"
              ? ".ko-wardrobe__tile"
              : path === "/online"
                ? ".ko-battle-mode-grid"
                : path === "/guide"
                  ? ".ko-guide"
                  : path === "/shop"
                    ? ".ko-market-item"
                    : path === "/collection"
                      ? ".ko-collection-controls"
                      : path === "/player-notebook"
                        ? ".ko-journal-sync"
                        : ".ko-page-content",
      )
      .first()
      .waitFor();
    await p.evaluate(() => document.fonts.ready);
    const x = await p.evaluate(() => {
      const nodes = [
        ...document.querySelectorAll("button,input,select,a[href]"),
      ].filter((n) => {
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        return (
          r.width &&
          r.height &&
          s.visibility !== "hidden" &&
          r.top < innerHeight &&
          r.bottom > 0 &&
          !n.disabled
        );
      });
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        small: nodes.flatMap((n) => {
          const own = n.getBoundingClientRect();
          const label =
            n.tagName === "INPUT" && n.labels?.[0]?.getBoundingClientRect();
          const r =
            label && label.width >= 44 && label.height >= 44 ? label : own;
          return r.width < 43 || r.height < 43
            ? [
                {
                  label: (
                    n.getAttribute("aria-label") ||
                    n.textContent ||
                    n.getAttribute("placeholder") ||
                    n.tagName
                  )
                    .trim()
                    .slice(0, 60),
                  width: Math.round(r.width),
                  height: Math.round(r.height),
                  cl: n.className,
                },
              ]
            : [];
        }),
        unnamed: nodes
          .filter(
            (n) =>
              !(
                n.getAttribute("aria-label") ||
                n.labels?.[0]?.textContent ||
                n.getAttribute("placeholder") ||
                (!["INPUT", "SELECT"].includes(n.tagName)
                  ? n.textContent
                  : "") ||
                ""
              ).trim(),
          )
          .map((n) => n.outerHTML.slice(0, 150)),
      };
    });
    results.push({ w, h, path, ...x });
    await p.screenshot({
      path: out + "/" + path.replaceAll("/", "_") + "-" + w + ".png",
    });
  }
  await p.context().close();
}
await b.close();
await writeFile(
  out + "/results.json",
  JSON.stringify({ results, errors: allErrors }, null, 2),
);
console.log(JSON.stringify({ results, errors: allErrors }));
if (
  allErrors.length ||
  results.some((x) => x.overflow || x.small.length || x.unnamed.length)
)
  throw new Error("Surface audit found actionable issues");
