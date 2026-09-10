import assert from "node:assert/strict";
import test from "node:test";
import { DisabledCodingAgentPort } from "./coding-agent-port";
import { isGenericMechanicEffectName } from "./mechanic-request-validation";
import {
  isPendingMechanicRequestConflict,
  prepareMechanicRequest,
} from "./mechanic-request-service";

test("mechanism requests rerun analysis and refuse supported effects", () => {
  const result = prepareMechanicRequest(
    "등장: 적 선수 하나에게 피해 2를 줍니다.",
    "admin",
    "request-1",
  );
  assert.equal(result.kind, "supported");
});

test("mechanism requests preserve analysis failures for prompt-driven implementation", () => {
  const result = prepareMechanicRequest("대단한 일을 합니다.", "admin", "request-1");
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.values.status, "PENDING");
  assert.deepEqual(result.values.unsupportedParts, result.analysis.unsupportedSegments);
});

test("mechanism request starts pending with server analysis details", () => {
  const result = prepareMechanicRequest(
    "등장: 모든 카드를 무작위로 섞습니다.",
    "admin",
    "request-1",
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.values.status, "PENDING");
  assert.equal(result.values.requestedBy, "admin");
  assert.deepEqual(result.values.unsupportedParts, result.analysis.unsupportedSegments);
});

test("generic mechanism names reject card-like names", () => {
  assert.equal(isGenericMechanicEffectName("RANDOM_CARD_SHUFFLE"), true);
  assert.equal(isGenericMechanicEffectName("THE_ROCK_SLAM"), false);
  assert.equal(isGenericMechanicEffectName("random_card_shuffle"), false);
});

test("creating a request does not invoke the disabled coding agent", () => {
  const port = new DisabledCodingAgentPort();
  const result = prepareMechanicRequest(
    "등장: 모든 카드를 무작위로 섞습니다.",
    "admin",
    "request-1",
  );
  assert.ok(port instanceof DisabledCodingAgentPort);
  assert.equal(result.kind, "ready");
});

test("PostgreSQL pending-request unique violations are classified as conflicts", () => {
  assert.equal(isPendingMechanicRequestConflict({ code: "23505" }), true);
  assert.equal(isPendingMechanicRequestConflict({ code: "22001" }), false);
  assert.equal(isPendingMechanicRequestConflict(null), false);
});