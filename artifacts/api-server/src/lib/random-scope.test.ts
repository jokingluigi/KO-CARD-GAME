import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeEffectText,isStructuredEffects,effectLibrary} from './structured-effects';

for(const [word,scope] of [['무작위','STANDARD'],['완전 무작위','FULL'],['완전히 무작위','FULL'],['완전 랜덤','FULL']] as const) {
  for(const body of [
    `${word} 선수 카드 1장을 내 손에 생성합니다.`,
    `내 손의 ${word} 선수 카드 1장에게 +1/+1을 부여합니다.`,
    `양옆 빈 슬롯에 ${word} 선수 카드들을 소환합니다.`,
    `선택한 무능력 선수 카드 1장에게 ${word} 선수 카드의 텍스트를 부여합니다. 등장 효과일 경우 그 효과를 발동 시킵니다.`,
  ]) test(`analyzer preserves ${scope}: ${body}`,()=>{
    const result=analyzeEffectText(`등장: ${body}`);
    assert.equal(result.outcome,'supported',JSON.stringify(result));
    assert.equal(result.effects[0]?.target?.randomScope,scope);
    assert.equal(isStructuredEffects({effects:result.effects}),true);
  });
}

test('effect registry describes publication and token rules explicitly',()=>{
  const rules=effectLibrary().valueResolvers.find(item=>item.name==='RANDOM_SCOPE');
  assert.ok(rules);
  assert.match(JSON.stringify(rules),/PUBLISHED/);
  assert.match(JSON.stringify(rules),/DRAFT/);
  assert.match(JSON.stringify(rules),/챔피언 토큰/);
});
