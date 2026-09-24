import assert from "node:assert/strict";
import test from "node:test";
import {
  dependencyValidationReason,
  championTokenReferenceReason,
  isDefinitionStatusAllowedForContext,
  isAIDefinitionStatusAllowed,
  isPublicDefinitionStatus,
} from "./ai-deck-service";

test("AI content pool allows published and draft, but never disabled", () => {
  assert.equal(isAIDefinitionStatusAllowed("PUBLISHED"), true);
  assert.equal(isAIDefinitionStatusAllowed("DRAFT"), true);
  assert.equal(isAIDefinitionStatusAllowed("DISABLED"), false);
});

test("public content pool remains published-only", () => {
  assert.equal(isPublicDefinitionStatus("PUBLISHED"), true);
  assert.equal(isPublicDefinitionStatus("DRAFT"), false);
  assert.equal(isPublicDefinitionStatus("DISABLED"), false);
});

test("draft dependencies are AI-only, while missing and disabled references remain invalid", () => {
  assert.equal(isDefinitionStatusAllowedForContext("DRAFT", "AI_DECK"), true);
  assert.equal(isDefinitionStatusAllowedForContext("DRAFT", "PLAYER_DECK"), false);
  assert.equal(dependencyValidationReason("DRAFT", "draft-token", "AI_DECK"), null);
  assert.match(dependencyValidationReason("DRAFT", "draft-token", "PLAYER_DECK") ?? "", /DRAFT/);
  assert.match(dependencyValidationReason("DISABLED", "disabled-token", "AI_DECK") ?? "", /DISABLED/);
  assert.match(dependencyValidationReason(null, "missing-token", "AI_DECK") ?? "", /찾을 수 없습니다/);
});

test("champion token references cannot target ordinary cards", () => {
  assert.match(championTokenReferenceReason({ isChampionToken: false }, "ordinary-card") ?? "", /아닙니다/);
  assert.equal(championTokenReferenceReason({ isChampionToken: true }, "token-card"), null);
});