import assert from "node:assert/strict";
import { writeFile, mkdir } from "node:fs/promises";
const { chromium } = await import(process.env.KO_QA_PLAYWRIGHT ?? "playwright");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
await mkdir("qa-results/fighting/videos", { recursive: true });
try {
  for (const [width, height] of [
    [360, 740],
    [375, 812],
    [390, 844],
    [412, 915],
    [768, 1024],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, recordVideo: { dir: "qa-results/fighting/videos", size: {width, height} } });
    const errors = [];
    await page.addInitScript(() => {
      window.__qaAudio = [];
      const play = HTMLMediaElement.prototype.play;
      const pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.play = function () { window.__qaAudio.push({type:"play",src:this.src,time:performance.now()}); return play.call(this); };
      HTMLMediaElement.prototype.pause = function () { window.__qaAudio.push({type:"pause",src:this.src,time:performance.now()}); return pause.call(this); };
    });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("**/api/card-frames", (r) =>
      r.fulfill({ json: { frames: [] } }),
    );
    await page.goto(
      (process.env.KO_QA_ORIGIN ?? "http://127.0.0.1:5174") +
        "/qa/cinematic.html",
    );
    await page.getByTestId("attack").waitFor();
    for (const action of ["attack", "blocked", "finisher"]) {
      await page.evaluate(() => { window.__qaAudio = []; });
      const samples = await page.evaluate(
        (action) =>
          new Promise((resolve) => {
            const data = [];
            let seen = false;
            const start = performance.now();
            document.querySelector('[data-testid="' + action + '"]').click();
            const tick = () => {
              const root = document.querySelector(".attack-animation");
              if (root) {
                seen = true;
                const a = root.querySelector(".attack-animation__attacker"),
                  t = root.querySelector(".attack-animation__target");
                const motion = a.getAnimations()[0],
                  targetMotion = t.getAnimations()[0];
                data.push({
                  phase: root.dataset.attackPhase,
                  stop: Number(root.dataset.hitstopMs),
                  time: Number(motion?.currentTime ?? 0),
                  targetTime: Number(targetMotion?.currentTime ?? 0),
                  frames: motion?.effect?.getKeyframes(),
                  duration: motion?.effect?.getTiming().duration,
                  a: getComputedStyle(a).transform,
                  t: getComputedStyle(t).transform,
                  shock: !!root.querySelector(".attack-animation__shockwave"),
                });
              }
              if ((seen && !root) || performance.now() - start > 2000)
                resolve(data);
              else requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
          }),
        action,
      );
      assert.ok(samples.length > 5);
      if(action === "attack") assert.ok(await page.locator('[data-external-vfx="IMPACT"]').count()>0,"dust must outlive card recovery");
      const audio = await page.evaluate(() => window.__qaAudio);
      if (action === "attack") {
        assert.equal(audio.filter(e=>e.type==='play'&&e.src.endsWith('contact-heavy.wav')).length,1,'one contact file must carry transient/body/bass together');
      }
      const frames = samples.find((s) => s.frames)?.frames;
      const offsets = frames
        ?.slice(3, 5)
        .map(
          (f) =>
            f.offset *
            samples.find((s) => s.duration)?.duration,
        );
      const held = samples.filter(
        (s) => offsets && s.time > offsets[0] + 5 && s.time < offsets[1] - 5,
      );
      await mkdir("qa-results/fighting", { recursive: true });
      await writeFile(
        "qa-results/fighting/clock-" + width + "-" + action + ".json",
        JSON.stringify(samples, null, 2),
      );
      if (action !== "blocked") {
        assert.ok(held.length >= 2, action + ": missing joint hold");
        assert.equal(
          new Set(held.map((s) => s.a)).size,
          1,
          action + ": attacker moved during hold",
        );
        assert.equal(
          new Set(held.map((s) => s.t)).size,
          1,
          action + ": target moved during hold",
        );
        assert.ok(
          held.some((s) => s.shock),
          action + ": missing contact shock during hitstop",
        );
        assert.ok(samples.some((s) => s.phase === "REACTION" && s.shock));
      } else assert.equal(samples[0].stop, 0);
      results.push({
        width,
        action,
        stop: samples[0].stop,
        phases: [...new Set(samples.map((s) => s.phase))],
        jointHoldFrames: held.length,
      });
    }
    const before = await page.getByTestId("counts").innerText();
    await page.getByTestId("attack").click();
    await page.locator(".attack-animation").waitFor();
    await page.setViewportSize({ width: width - 1, height });
    await page.locator(".attack-animation").waitFor({ state: "detached" });
    const after = await page.getByTestId("counts").innerText();
    assert.equal(before, "impact:3 complete:3");
    assert.equal(after, "impact:4 complete:4");
    await page.evaluate(() => {
      Element.prototype.animate = () => {
        throw new Error("QA unsupported WAAPI");
      };
    });
    await page.getByTestId("attack").click();
    await page
      .getByTestId("counts")
      .filter({ hasText: "impact:5 complete:5" })
      .waitFor();
    await page.waitForTimeout(300);
    assert.equal(
      await page.getByTestId("counts").innerText(),
      "impact:5 complete:5",
    );
    assert.equal(await page.locator(".attack-animation").count(), 0);
    assert.deepEqual(errors, []);
    results.push({
      width,
      resizeRecovery: true,
      animationApiFailureRecovery: true,
      callbacksExactlyOnce: true,
    });
    const video = page.video();
    await page.context().close();
    if (video) await video.saveAs(`qa-results/fighting/videos/impact-${width}x${height}.webm`);
  }
  await mkdir("qa-results/fighting", { recursive: true });
  await writeFile(
    "qa-results/fighting/impact-clock.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
