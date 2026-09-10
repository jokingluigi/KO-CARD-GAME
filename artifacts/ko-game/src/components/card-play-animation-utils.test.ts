import assert from "node:assert/strict";
import test from "node:test";

import { landingImpactLevel } from "./card-play-animation-utils";

test("착지 무게감은 current cost가 아니라 base cost로 결정한다", () => {
  assert.equal(landingImpactLevel(1, 0), "LIGHT");
  assert.equal(landingImpactLevel(3, 0), "NORMAL");
  assert.equal(landingImpactLevel(5, 0), "HEAVY");
  assert.equal(landingImpactLevel(6, 0), "VERY_HEAVY");
  assert.equal(landingImpactLevel(10, 1), "VERY_HEAVY");
  assert.equal(landingImpactLevel(undefined, 6), "VERY_HEAVY");
});