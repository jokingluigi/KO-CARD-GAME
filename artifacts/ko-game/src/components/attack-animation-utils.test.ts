import assert from "node:assert/strict";
import test from "node:test";

import {
  attackDamageImpactLevel,
  attackImpactLevel,
  attackSoundPitch,
  attackScreenShakeLevel,
} from "./attack-animation-utils";

test("공격 충돌 단계는 실제 current attack을 네 구간으로 나눈다", () => {
  assert.equal(attackImpactLevel(1), "LIGHT");
  assert.equal(attackImpactLevel(3), "NORMAL");
  assert.equal(attackImpactLevel(5), "HEAVY");
  assert.equal(attackImpactLevel(8), "VERY_HEAVY");
});

test("같은 피해라도 공격력이 강하면 더 크게 흔들리고 방어된 타격은 흔들리지 않는다", () => {
  assert.equal(attackScreenShakeLevel(1, 1), "VERY_LIGHT");
  assert.equal(attackScreenShakeLevel(7, 1), "VERY_HEAVY");
  assert.equal(attackScreenShakeLevel(7, 0), "NONE");
  assert.equal(attackScreenShakeLevel(2, 1, true), "VERY_HEAVY");
});

test("8 이상 공격은 매우 강한 타격의 오디오 피치를 사용한다", () => {
  assert.equal(attackSoundPitch(1), 1);
  assert.equal(attackSoundPitch(5), 1);
  assert.equal(attackSoundPitch(8), 1.06);
});

test("screen shake 단계는 실제 피해량을 여섯 구간으로 나눈다", () => {
  assert.equal(attackDamageImpactLevel(0), "NONE");
  assert.equal(attackDamageImpactLevel(1), "VERY_LIGHT");
  assert.equal(attackDamageImpactLevel(2), "LIGHT");
  assert.equal(attackDamageImpactLevel(3), "LIGHT");
  assert.equal(attackDamageImpactLevel(4), "MEDIUM");
  assert.equal(attackDamageImpactLevel(5), "MEDIUM");
  assert.equal(attackDamageImpactLevel(6), "HEAVY");
  assert.equal(attackDamageImpactLevel(7), "HEAVY");
  assert.equal(attackDamageImpactLevel(8), "VERY_HEAVY");
  assert.equal(attackDamageImpactLevel(20), "VERY_HEAVY");
});
