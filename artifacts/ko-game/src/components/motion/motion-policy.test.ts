import assert from "node:assert/strict";
import test from "node:test";
import {
  interfaceDirection,
  interfaceFrames,
  interfaceRoute,
} from "./interface-motion-policy";
import { boundPortraitFrames } from "./battle-motion-bounds";
import { combatTimeline, attackFrames } from "../battle-vfx-model";
test("navigation direction and allowlist exclude admin and actual battle routes", () => {
  assert.equal(interfaceDirection("/", "/collection"), 1);
  assert.equal(interfaceDirection("/decks", "/"), -1);
  for (const path of [
    "/admin",
    "/ai-match",
    "/online/match/123",
    "/draft/match/123",
  ])
    assert.equal(interfaceRoute(path), false);
  assert.equal(interfaceRoute("/collection?q=x"), true);
});
test("reduced UI cues keep acknowledgement without translation or scaling", () => {
  for (const kind of [
    "ACTIVE",
    "PENDING",
    "SUCCESS",
    "ERROR",
    "REPLACE",
  ] as const) {
    const f = interfaceFrames(kind, true);
    assert.ok(
      f.every(
        (x) => !("translate" in x) && !("transform" in x) && !("scale" in x),
      ),
    );
    assert.equal(
      f.at(-1)?.filter === undefined || f.at(-1)?.filter === "brightness(1)",
      true,
    );
  }
});
test("mobile portrait translation stays inside viewport, input frames and original keyframes unchanged", () => {
  const original = [
    { offset: 0, transform: "translate(-40px,30px) rotate(3deg) scale(1.02)" },
    { offset: 1, transform: "translate(0px,0px) rotate(0deg) scale(1)" },
  ];
  const copy = JSON.stringify(original);
  const next = boundPortraitFrames(
    original,
    { left: 5, top: 6, right: 105, bottom: 206, width: 100, height: 200 },
    { width: 110, height: 210 },
  );
  assert.match(String(next[0].transform), /translate\(-1px,0px\)/);
  assert.equal(JSON.stringify(original), copy);
  assert.equal(next.at(-1)?.transform, original.at(-1)?.transform);
});
test("attack contact and hold remain unchanged while recovery has recoil and a single small overshoot", () => {
  for (const power of [1, 3, 6, 12]) {
    const time = combatTimeline(power, power),
      frames = attackFrames(100, -200, time, false, power);
    const contact = frames.find(
        (f) => f.offset === time.impact / time.duration,
      ),
      hold = frames.find((f) => f.offset === time.release / time.duration);
    assert.equal(contact?.transform, hold?.transform);
    assert.match(
      String(frames.at(-1)?.transform),
      /translate3d\(0px,0px,0\) scale\(1\)/,
    );
    assert.ok(
      frames.some((f) => String(f.transform).includes("translate3d(-1.799")) ||
        frames.some((f) => String(f.transform).includes("translate3d(-1.8")),
    );
    assert.ok(
      frames.every(
        (f, i) => !i || Number(f.offset) >= Number(frames[i - 1].offset),
      ),
    );
  }
});
