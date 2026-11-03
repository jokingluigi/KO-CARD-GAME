/** Direct menu entry and canonical rules reference through actual application routes. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "./black-gold-playwright.mjs";
import { auditSetup } from "./ui-audit-fixture.mjs";
const origin = process.env.KO_UI_ORIGIN ?? "http://127.0.0.1:5186",
  out = process.env.KO_TUTORIAL_ACCESS_OUT ?? "qa-results/tutorial-access";
await mkdir(out, { recursive: true });
const b = await chromium.launch(),
  results = [];
try {
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [360, 740],
    [375, 667],
    [390, 844],
    [844, 390],
    [1440, 900],
  ]) {
    const p = await b.newPage({
      viewport: { width, height },
      isMobile: width <= 390,
      hasTouch: width <= 390,
      reducedMotion: "reduce",
      ignoreHTTPSErrors: true,
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
    await auditSetup(p);
    if (process.env.KO_QA_BLOCK_FONTS === "1") await p.route("**/*.woff2", route => route.abort());
    await p.goto(origin + "/");
    await p.getByText("출전 검증 덱", { exact: true }).waitFor();
    await p.evaluate(() => document.fonts.ready);
    const targets = await p
      .locator(".ko-home-learning button,.ko-lobby-more")
      .evaluateAll((nodes) =>
        nodes.map((n) => {
          const r = n.getBoundingClientRect(),
            hit = document.elementFromPoint(
              r.x + r.width / 2,
              r.y + r.height / 2,
            );
          return {
            label: n.textContent,
            top: r.top,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
            hit: !!hit && (n === hit || n.contains(hit)),
          };
        }),
      );
    for (const t of targets) {
      assert.ok(
        t.top >= 0 && t.bottom <= height + 1,
        `${width}x${height} clipped ${JSON.stringify(t)}`,
      );
      assert.ok(t.width >= 44 && t.height >= 44);
      assert.equal(t.hit, true);
    }
    assert.equal(
      await p.evaluate(
        () =>
          document.documentElement.scrollHeight > innerHeight + 1 ||
          document.documentElement.scrollWidth > innerWidth + 1,
      ),
      false,
    );
    await p.screenshot({ path: `${out}/home-${width}x${height}.png` });
    await p.getByRole("button", { name: /^튜토리얼/ }).click();
    await p
      .getByRole("heading", { name: "직접 배우는 카드 전투", exact: true })
      .waitFor();
    await p.getByTestId("lesson-basics").waitFor();
    await p.waitForFunction(
      () =>
        !document
          .querySelector('[data-testid="lesson-basics"]')
          ?.hasAttribute("disabled"),
    );
    assert.equal(await p.locator('[data-testid^="lesson-"]').count(), 6);
    await p
      .getByRole("button", {
        name: "게임 규칙 설명 · 챔피언 토큰",
        exact: true,
      })
      .click();
    const dialog = p.getByRole("dialog");
    await dialog
      .getByRole("heading", { name: "게임 규칙", exact: true })
      .waitFor();
    assert.equal(
      await dialog
        .getByText(
          "온라인 대전은 도움말을 읽는 동안에도 턴 시간이 계속 흘러요.",
          { exact: true },
        )
        .count(),
      0,
    );
    await dialog
      .getByRole("button", { name: "챔피언·토큰", exact: true })
      .click();
    await dialog
      .getByRole("heading", { name: "3. 챔피언과 챔피언 토큰", exact: true })
      .waitFor();
    assert.equal(await dialog.locator(".ko-guide-entries details").count(), 7);
    await dialog
      .getByText("챔피언 토큰이 있으면 왜 본체를 공격할 수 없나요?", {
        exact: true,
      })
      .click();
    await dialog
      .getByText(
        "내 필드에 챔피언 토큰·직접 출전 챔피언 또는 챔피언 등급 카드가 있으면 챔피언 본체가 보호됩니다.",
        { exact: false },
      )
      .waitFor();
    if (width === 390)
      await p.screenshot({ path: out + "/tutorial-rule-dialog-390.png" });
    await dialog
      .getByRole("button", { name: "도움말 닫기", exact: true })
      .click();
    assert.ok(
      await p
        .getByRole("heading", { name: "직접 배우는 카드 전투", exact: true })
        .isVisible(),
    );
    await p.goto(origin + "/");
    await p.getByText("출전 검증 덱", { exact: true }).waitFor();
    await p.evaluate(() => document.fonts.ready);
    await p.getByRole("button", { name: /^게임 규칙/ }).click();
    await p.getByRole("heading", { name: "게임 규칙", exact: true }).waitFor();
    await p.locator(".ko-guide-chapter h2").first().waitFor();
    const headings = await p.locator(".ko-guide-chapter h2").allTextContents();
    assert.equal(headings.length, 5);
    assert.ok(headings[0].startsWith("1. 기본 규칙"));
    await p.getByRole("button", { name: "챔피언·토큰", exact: true }).click();
    assert.equal(await p.locator(".ko-guide-chapter").count(), 1);
    assert.equal(await p.locator(".ko-guide-entries details").count(), 7);
    await p
      .getByText("챔피언 본체와 챔피언 토큰 카드는 무엇이 다른가요?", {
        exact: true,
      })
      .click();
    await p.screenshot({
      path: `${out}/champion-tokens-${width}x${height}.png`,
    });
    assert.deepEqual(errors, []);
    results.push({
      width,
      height,
      targets,
      homeFits: true,
      oneClickTutorial: true,
      sixActualLessons: true,
      sharedReferenceDialog: true,
      orderedRuleChapters: true,
      tokenChapterQuestions: 7,
      errors,
    });
    await p.close();
  }
  await writeFile(out + "/results.json", JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results));
} finally {
  await b.close();
}
