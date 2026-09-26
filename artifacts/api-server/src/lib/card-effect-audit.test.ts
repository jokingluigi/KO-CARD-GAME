import assert from "node:assert/strict";
import test from "node:test";
import { auditCardEffect } from "./card-effect-audit";
import type { Analysis } from "./structured-effects";

const analysis: Analysis = {
  status: "success", outcome: "supported", effects: [], keywords: ["TAUNT"],
  unsupportedSegments: [], summaries: [],
};

test("audit flags a missing keyword without claiming match execution", () => {
  const card = { id: "one", text: "도발", keywords: [] as string[], effectId: null, effectConfig: {} };
  assert.equal(auditCardEffect(card, analysis).status, "missing");
  assert.equal(auditCardEffect({ ...card, keywords: ["TAUNT"] }, analysis).status, "none");
});

test("audit asks for review if the analyzer cannot understand the card", () => {
  const card = { id: "two", text: "새로운 규칙", keywords: [] as string[], effectId: null, effectConfig: {} };
  assert.equal(auditCardEffect(card, { ...analysis, status: "failure", outcome: "analysis_failure" }).status, "review");
});

test("audit flags text with an executable effect but no saved effect ID", () => {
  const card = { id: "three", text: "등장: 카드를 뽑는다", keywords: [] as string[], effectId: null, effectConfig: {} };
  const effect = { trigger: "ENTER_FIELD", action: "DRAW" } as Analysis["effects"][number];
  assert.equal(auditCardEffect(card, { ...analysis, keywords: [], effects: [effect] }).status, "missing");
});
