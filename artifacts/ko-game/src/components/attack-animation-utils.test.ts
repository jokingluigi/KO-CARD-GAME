import assert from "node:assert/strict";
import test from "node:test";

import {
  attackImpactLevel,
  attackSoundPitch,
} from "./attack-animation-utils";

test("공격 충돌 단계는 실제 current attack을 네 구간으로 나눈다", () => {
  assert.equal(attackImpactLevel(1), "LIGHT");
  assert.equal(attackImpactLevel(3), "NORMAL");
  assert.equal(attackImpactLevel(5), "HEAVY");
  assert.equal(attackImpactLevel(8), "VERY_HEAVY");
});

test("8 이상 공격은 매우 강한 타격의 오디오 피치를 사용한다", () => {
  assert.equal(attackSoundPitch(1), 1);
  assert.equal(attackSoundPitch(5), 1);
  assert.equal(attackSoundPitch(8), 1.06);
});