import assert from "node:assert/strict";
import { test } from "node:test";
import { analyzeEffectText, isStructuredEffects } from "./structured-effects";
import { DISPLAY_LABELS, validProgramConfig } from "@workspace/effect-registry";
import { cardRecordToDefinition } from "../../../ko-game/src/game/cards/published-cards";
const effect = {
  trigger: "ENTER_FIELD",
  action: "PROGRAM",
  values: {
    programCost: 2,
    programEffects: [
      {
        action: "BUFF",
        target: {
          zone: "BOARD",
          owner: "SELF",
          cardType: "WRESTLER",
          selection: "PLAYER_CHOICE",
          count: 1,
          filter: { excludeSource: true, definitionRef: { name: "좀비" } },
        },
        values: { attack: 2, health: 2 },
      },
    ],
  },
};
test("authoring accepts reusable upgrade group, rejects corrupt costs and payloads", () => {
  assert.equal(isStructuredEffects({ effects: [effect] }), true);
  for (const programCost of [-1, 1.5, "2", null])
    assert.equal(
      isStructuredEffects({
        effects: [{ ...effect, values: { ...effect.values, programCost } }],
      }),
      false,
    );
  assert.equal(
    validProgramConfig({
      effects: [{ ...effect, values: { programCost: 2, programEffects: [] } }],
    }),
    false,
  );
});
test("visible name is 업그레이드 while serialized PROGRAM remains compatible", () => {
  assert.equal(DISPLAY_LABELS.PROGRAM, "업그레이드");
  for (const name of ["업그레이드", "프로그램", "PROGRAM"]) {
    const r = analyzeEffectText(
      `등장 — ${name}(2): 다른 아군 좀비 1장에게 +2/+2를 부여합니다.`,
    );
    assert.equal(r.status, "success", JSON.stringify(r));
    assert.equal(r.effects[0]?.action, "PROGRAM");
    assert.equal(r.effects[0]?.values?.programCost, 1);
    assert.equal(
      isStructuredEffects({ effects: r.effects }),
      true,
      JSON.stringify(r),
    );
  }
});
test("normal entry and upgrade text compile to independent ordered effects", () => {
  const r = analyzeEffectText(
    "등장: 카드 1장을 뽑습니다.\n등장 — 업그레이드(2): 다른 아군 좀비 1장에게 +2/+2를 부여합니다.",
  );
  assert.equal(r.status, "success", JSON.stringify(r));
  assert.deepEqual(
    r.effects.map((e) => e.action),
    ["DRAW", "PROGRAM"],
  );
});
test("published upgrade definitions retain their group rather than generic text repairs", () => {
  const d = cardRecordToDefinition({
    id: "qa-upgrade",
    name: "검증",
    cardType: "WRESTLER",
    rarity: "NORMAL",
    cost: 2,
    attack: 2,
    health: 3,
    text: "등장 — 업그레이드(2): 다른 아군 좀비 1장에게 +2/+2를 부여합니다.",
    keywords: [],
    isToken: false,
    isChampionToken: false,
    effectId: "STRUCTURED_EFFECTS_V1",
    effectConfig: { effects: [effect] },
    status: "DRAFT",
    version: 1,
    createdAt: "",
    updatedAt: "",
    imageAssetId: null,
    imageUrl: null,
  });
  assert.ok(d.keywords.includes("PROGRAM"));
  assert.equal(d.abilities[0].effects[0].type, "STRUCTURED");
  assert.equal((d.abilities[0].effects[0] as any).action, "PROGRAM");
});

test("committed automatic upgrade supports targets in future spell/ability groups", () => {
  assert.equal(
    isStructuredEffects({ effects: [{ ...effect, trigger: "ACTIVE" }] }),
    true,
  );
});

test("bare upgrade syntax and legacy numeric notation both compile to fixed one gold", () => {
  for(const marker of ["업그레이드","업그레이드(9)","프로그램","PROGRAM(0)"]){
    const r=analyzeEffectText(`등장 — ${marker}: 다른 아군 좀비 1장에게 +2/+2를 부여합니다.`);
    assert.equal(r.status,"success",JSON.stringify(r));assert.equal(r.effects[0]?.values?.programCost,1);
  }
  const {programCost,...values}=effect.values;assert.equal(validProgramConfig({effects:[{...effect,values}]}),true);
});
