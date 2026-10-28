import { chromium } from "./black-gold-playwright.mjs";
import assert from "node:assert/strict";
import { readFile, mkdir } from "node:fs/promises";
const fixture = JSON.parse(
  await readFile("qa-results/cosmetics/fixture.json", "utf8"),
);
const origin = process.env.KO_COSMETICS_FRONTEND;
assert.equal(new URL(origin).hostname, "127.0.0.1");
const out = "qa-results/sprite-workspace";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const apiOrigin = process.env.KO_COSMETICS_API_ORIGIN;
  if (apiOrigin) {
    assert.equal(new URL(apiOrigin).hostname, "127.0.0.1");
    await context.route("**/api/**", async route => {
      const url = new URL(route.request().url());
      const response = await route.fetch({ url: apiOrigin + url.pathname + url.search });
      await route.fulfill({ response });
    });
  }
  const [name, ...rest] = fixture.cookies.admin.split("=");
  await context.addCookies([{ name, value: rest.join("="), url: origin }]);
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const target = "skin:" + fixture.registered.CHAMPION_SKIN.id;
  async function open() {
    await page.goto(
      origin + "/admin/battle-sprites?target=" + encodeURIComponent(target),
    );
    await page
      .getByLabel("대전 스프라이트 업로드")
      .waitFor({ timeout: 10000 })
      .catch(async (e) => {
        console.log(
          "OPEN_FAILED",
          page.url(),
          errors,
          (await page.locator("body").innerText()).slice(0, 1600),
        );
        await page.screenshot({ path: out + "/failure.png" });
        throw e;
      });
    assert.equal(
      await page.getByLabel("스프라이트 스킨 선택").inputValue(),
      target,
    );
  }
  async function upload(file = "qa-results/cosmetics/upload-fixture.png") {
    await page
      .getByLabel("대전 스프라이트 업로드")
      .setInputFiles(file);
    await page.getByAltText("상태·반응 미리보기").waitFor();
    await page
      .getByRole("button", { name: "스프라이트 저장", exact: true })
      .waitFor();
  }
  async function save() {
    const pending = page.waitForResponse(
      (r) =>
        r.url().includes("/admin/battle-sprites/skin/") &&
        r.request().method() === "PATCH",
    );
    await page
      .getByRole("button", { name: "스프라이트 저장", exact: true })
      .click();
    assert.equal((await pending).status(), 200);
  }
  async function advanced() {
    const details = page.locator(".ko-sprite-advanced");
    if (!(await details.evaluate((n) => n.open)))
      await details.locator("summary").click();
  }
  await open();
  assert.equal(await page.getByLabel("스프라이트 표정").locator("option").count(),10);
  assert.deepEqual(await page.getByLabel("스프라이트 표정").locator("option").allTextContents(),
    ["기본","공격","피격","강한 피격","저체력","소환","놀람","승리","패배","안도"]);
  await upload();
  await page.getByLabel('움직임 프리셋',{exact:true}).selectOption('HEAVY');
  await page.getByLabel('움직임 이동',{exact:true}).fill('0.8');
  await page.getByLabel('움직임 속도',{exact:true}).fill('0.75');
  await page.getByLabel('움직임 회전 기준 Y',{exact:true}).fill('92');
  await page.getByRole('button',{name:'고유능력 효과',exact:true}).click();
  assert.equal(await page.locator('.ko-sprite-visual').getAttribute('data-motion-preset'),'HEAVY');
  await page.waitForTimeout(1100);
  const size = await page.locator(".ko-sprite-preview-canvas").boundingBox();
  assert.ok(size.height >= 420 && size.width >= 260, JSON.stringify(size));
  const scale = page.getByLabel("스프라이트 scale", { exact: true });
  await scale.focus();
  await scale.press("ArrowRight");
  const expectedScale = await scale.inputValue();
  await page.getByLabel("큰 미리보기 위치").selectOption("opponent");
  await page.getByLabel("스프라이트 표정").selectOption("hurt");
  await upload(process.env.KO_SPRITE_QA_WEBP ?? "qa-results/cosmetics/upload-fixture.png");
  await advanced();
  await page.getByLabel("HIT 표정 연결", { exact: true }).selectOption("hurt");
  await page.locator('.ko-sprite-effects-settings summary').click();
  await page.getByLabel('스프라이트 효과 강조색',{exact:true}).fill('#a1b2c3');
  const originX=page.getByLabel('스프라이트 출발점 x',{exact:true});
  await originX.focus();await originX.press('ArrowRight');
  const savedOrigin=await originX.inputValue();
  await page.locator('.ko-sprite-emote-settings summary').click();
  const thanks=page.getByLabel('THANKS 감정표현 표정',{exact:true});
  await thanks.selectOption('hurt');
  await thanks.locator('..').locator('..').getByRole('button',{name:'미리보기',exact:true}).click();
  assert.equal(await page.locator('.ko-sprite-preview-canvas').getAttribute('data-reaction'),'EMOTE');

  assert.equal(await page.locator(".ko-sprite-preview-figure").evaluate(n => getComputedStyle(n).transform), "matrix(-1, 0, 0, 1, 0, 0)");
  await save();
  await open();
  assert.equal(await scale.inputValue(), expectedScale);
  assert.equal(await page.getByLabel('움직임 프리셋',{exact:true}).inputValue(),'HEAVY');
  assert.equal(await page.getByLabel('움직임 이동',{exact:true}).inputValue(),'0.8');
  assert.equal(await page.getByLabel('움직임 속도',{exact:true}).inputValue(),'0.75');
  assert.equal(await page.getByLabel('움직임 회전 기준 Y',{exact:true}).inputValue(),'92');
  await page.getByLabel("큰 미리보기 위치").selectOption("opponent");
  await page.getByLabel("스프라이트 표정").selectOption("hurt");
  assert.equal(await page.locator(".ko-sprite-preview-figure").evaluate(n => getComputedStyle(n).transform), "matrix(-1, 0, 0, 1, 0, 0)");
  await page.locator('.ko-sprite-effects-settings summary').click();
  assert.equal(await page.getByLabel('스프라이트 효과 강조색',{exact:true}).inputValue(),'#a1b2c3');
  assert.equal(await page.getByLabel('스프라이트 출발점 x',{exact:true}).inputValue(),savedOrigin);
  await page.locator('.ko-sprite-emote-settings summary').click();
  assert.equal(await page.getByLabel('THANKS 감정표현 표정',{exact:true}).inputValue(),'hurt');
  await advanced();
  assert.equal(
    await page.getByLabel("HIT 표정 연결", { exact: true }).inputValue(),
    "hurt",
  );
  await page.getByLabel("스프라이트 표정").selectOption("default");
  await page.getByLabel("편집 세트", { exact: true }).selectOption("AWAKENED");
  await upload();
  await page.getByLabel('움직임 프리셋',{exact:true}).selectOption('AGGRESSIVE');
  const awakeURL = await page
    .getByAltText("상태·반응 미리보기")
    .getAttribute("src");
  await page.getByLabel("각성 외형", { exact: true }).selectOption("REPLACE");
  await save();
  await open();
  assert.equal(
    await page.getByLabel("각성 외형", { exact: true }).inputValue(),
    "REPLACE",
  );
  await page.getByLabel("각성", { exact: true }).check();
  await page.getByLabel("미리보기 체력", { exact: true }).fill("4");
  assert.equal(
    await page.getByAltText("상태·반응 미리보기").getAttribute("src"),
    awakeURL,
  );
  await page.getByRole("button", { name: "피격 재생", exact: true }).click();
  await page.waitForTimeout(750);
  assert.equal(
    await page.getByAltText("상태·반응 미리보기").getAttribute("src"),
    awakeURL,
  );
  await page
    .locator(".ko-sprite-reaction-preview")
    .screenshot({ path: out + "/mobile-preview.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth + 1,
    ),
    false,
  );
  await page.getByRole("button", { name: "전체 화면", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.screenshot({ path: out + "/mobile-fullscreen.png" });
  await page
    .getByRole("button", { name: "전체 화면 닫기", exact: true })
    .click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page
    .getByRole("button", { name: "상태·반응 확인", exact: true })
    .click();
  await page.locator(".ko-sprite-reaction-preview").scrollIntoViewIfNeeded();
  const large = await page.locator(".ko-sprite-preview-canvas").boundingBox();
  assert.ok(large.width >= 400 && large.height >= 500, JSON.stringify(large));
  await page.screenshot({ path: out + "/desktop.png" });
  await page.getByRole("button", { name: "전체 화면", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page
    .getByRole("button", { name: "전체 화면 닫기", exact: true })
    .click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByLabel("편집 세트", { exact: true }).selectOption("NORMAL");
  await page.getByLabel("스프라이트 표정").selectOption("hurt");
  await page
    .getByRole("button", { name: "현재 표정 등록 해제", exact: true })
    .click();
  await save();
  await open();
  await advanced();
  assert.equal(
    await page.getByLabel("HIT 표정 연결", { exact: true }).inputValue(),
    "",
  );
  await page
    .getByRole("button", { name: "전체 스프라이트 등록 해제", exact: true })
    .click();
  await save();
  await open();
  assert.notEqual(await page.getByAltText("상태·반응 미리보기").getAttribute("src"), awakeURL);
  assert.deepEqual(errors, []);
  console.log(
    "PASS standalone skin-bound workspace, large mobile/desktop previews, fullscreen, upload/framing/flip, save/reopen, awake fallback, reaction timeout and unregister",
  );
} finally {
  await browser.close();
}
