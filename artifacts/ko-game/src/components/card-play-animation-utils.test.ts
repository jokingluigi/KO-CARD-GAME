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
import { techniqueRevealRect } from './card-play-animation-utils';
import { strict as geometryAssert } from 'node:assert';
import { test as geometryTest } from 'node:test';

geometryTest('opponent technique reveal uses portrait card proportions instead of the hidden hand row', () => {
  const source = { left: 20, top: 30, width: 600, height: 60 };
  const card = techniqueRevealRect(source);
  geometryAssert.equal(card.width, 180);
  geometryAssert.equal(card.height / card.width, 1484 / 1060);
  geometryAssert.equal(card.left + card.width / 2, source.left + source.width / 2);
  geometryAssert.equal(card.top + card.height / 2, source.top + source.height / 2);
});
