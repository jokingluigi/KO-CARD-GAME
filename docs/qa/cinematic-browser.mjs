// Run against Vite's development-only qa/cinematic.html fixture.
// KO_QA_PLAYWRIGHT may point to an installed Playwright module (file URL).
// KO_QA_CHROME, KO_QA_ORIGIN and KO_QA_SCREENSHOTS are optional.
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
import { mkdirSync } from "node:fs";
const output = process.env.KO_QA_SCREENSHOTS;
if (output) mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.KO_QA_CHROME
    ? { executablePath: process.env.KO_QA_CHROME }
    : process.env.KO_QA_CHROME_CHANNEL==='chromium'?{}:{ channel: "chrome" }),
  headless: true,
});
const failures = [];
const results = [];
for (const [name, width, height, reduced] of [
  ["desktop", 1280, 800, false],
  ["mobile", 390, 844, false],
  ["small", 320, 568, false],
  ["landscape", 844, 390, false],
  ["reduced", 390, 844, true],
]) {
  const context = await browser.newContext({
    viewport: { width, height },
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => failures.push(`${name}:${error.message}`));
  await page.route("**/api/card-frames", (route) =>
    route.fulfill({ json: { frames: [] } }),
  );
  await page.goto(
    (process.env.KO_QA_ORIGIN ?? "http://localhost:5173") +
      "/qa/cinematic.html",
  );
  await page.getByTestId("attack").waitFor();
  let finished = 0;
  for (const action of [
    "attack",
    "blocked",
    "spell",
    "landing",
    "heal",
    "destroy",
    "retire",
    "quest",
  ]) {
    await page.getByTestId(action).click();
    if (action === "spell" && !reduced) {
      await page.waitForTimeout(150);
      const bounds = await page
        .locator(".card-play-animation__card")
        .boundingBox();
      if (
        !bounds ||
        bounds.x < 0 ||
        bounds.y < 0 ||
        bounds.x + bounds.width > width + 1 ||
        bounds.y + bounds.height > height + 1
      )
        failures.push(`${name}:spell clipped ${JSON.stringify(bounds)}`);
      if (output && (name === "mobile" || name === "landscape"))
        await page.screenshot({ path: `${output}/${name}-spell.png` });
    }
    if(action==='landing'&&!reduced) {
      await page.locator('.card-play-animation__card').waitFor();
      const ratio=await page.locator('.card-play-animation__card').evaluate(el=>el.offsetHeight/el.offsetWidth);
      if(Math.abs(ratio-1484/1060)>.025) failures.push(`${name}:flattened wrestler ${ratio}`);
      if(output&&name==='mobile') await page.screenshot({path:`${output}/mobile-wrestler.png`});
    }
    if (output && action === "attack" && name === "desktop") {
      await page.waitForTimeout(330);
      await page.screenshot({ path: `${output}/desktop-attack.png` });
    }
    finished++;
    await page
      .getByTestId("counts")
      .filter({ hasText: `complete:${finished}` })
      .waitFor({ timeout: 6000 });
  }
  const counts = await page.getByTestId("counts").textContent();
  if (counts !== "impact:2 complete:8")
    failures.push(`${name}: callbacks ${counts}`);
  await page.getByTestId("attack").click();
  await page.getByTestId("heal").click();
  await page
    .getByTestId("counts")
    .filter({ hasText: "complete:9" })
    .waitFor({ timeout: 6000 });
  if (
    (await page.getByTestId("counts").textContent()) !== "impact:2 complete:9"
  )
    failures.push(`${name}:cancelled attack leaked a callback`);
  await page.getByTestId("spell").click();
  await page.setViewportSize({ width: height, height: width });
  if (!reduced) {
    await page.waitForTimeout(150);
    const bounds = await page
      .locator(".card-play-animation__card")
      .boundingBox();
    if (
      !bounds ||
      bounds.x < 0 ||
      bounds.y < 0 ||
      bounds.x + bounds.width > height + 1 ||
      bounds.y + bounds.height > width + 1
    )
      failures.push(`${name}:rotation clipped the spell`);
  }
  await page
    .getByTestId("counts")
    .filter({ hasText: "complete:10" })
    .waitFor({ timeout: 6000 });
  await page.getByTestId('damage').click();
  await page.locator('.presentation-feedback--damage').waitFor();
  if(await page.locator('.presentation-feedback__label').textContent()!=='-6') failures.push(`${name}:missing effect damage amount`);
  if(!reduced && await page.locator('.presentation-feedback__effect-hit').count()!==1) failures.push(`${name}:missing effect impact`);
  if(output&&(name==='mobile'||name==='desktop')) {await page.waitForTimeout(100);await page.screenshot({path:`${output}/${name}-effect-damage.png`});}
  await page.getByTestId('counts').filter({hasText:'complete:11'}).waitFor({timeout:6000});
  const pulse=await page.evaluate(()=>{const el=document.createElement('div');el.className='presentation-card-pulse';document.body.append(el);const name=getComputedStyle(el).animationName;el.remove();return name;});
  if(pulse!=='none') failures.push(`${name}:card still flashes ${pulse}`);
  await page.getByTestId('reward').click();
  await page.getByText('+200 크레딧 지급',{exact:true}).waitFor();
  if(await page.getByRole('alert').count()) failures.push(`${name}:paid credits incorrectly shown as reward failure`);
  await page.getByTestId('button-return-to-main-menu').click();
  await page.getByTestId('reward-error').click();
  await page.getByRole('alert').waitFor();
  await page.getByTestId('button-return-to-main-menu').click();
  await page.getByTestId("defeat").click();
  await page.locator(".champion-defeat-cinematic").waitFor();
  await page.getByTestId("button-return-to-main-menu").waitFor({timeout:4000});
  await page.getByTestId("button-return-to-main-menu").click();
  const beforeFinish=await page.getByTestId("counts").textContent();
  await page.getByTestId("finisher").click();
  await page.waitForFunction(previous=>document.querySelector('[data-testid="counts"]')?.textContent!==previous,beforeFinish);
  await page.locator(".attack-animation").waitFor({state:"detached"});
  const active = await page
    .locator(
      ".attack-animation,.card-play-animation,.card-leave-animation,.presentation-feedback,.quest-presentation",
    )
    .count();
  if (active) failures.push(`${name}:stale presentation ${active}`);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) failures.push(`${name}:horizontal overflow`);
  results.push({ name, width, height, reduced, counts, active, overflow });
  await context.close();
}
await browser.close();
console.log(JSON.stringify({ results, failures }));
if (failures.length) process.exitCode = 1;
