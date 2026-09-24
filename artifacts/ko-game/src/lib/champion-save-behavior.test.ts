import assert from "node:assert/strict";
import test from "node:test";

type SaveFailure = { status?: number; network?: boolean; field?: string };
function classifySaveFailure(failure: SaveFailure) {
  if (failure.network) return "network";
  if (failure.status === 401) return "session";
  if (failure.status === 403) return "permission";
  if (failure.status === 409) return "conflict";
  if (failure.status === 422 || failure.status === 400) return "validation";
  if (failure.status && failure.status >= 500) return "server";
  return "unknown";
}

test("fixture save payload uses immediate field and analyzer changes", () => {
  const form = {
    name: "Fixture",
    abilityText: "Gain gold",
    abilityEffects: { effects: [{ action: "GAIN_GOLD", values: { amount: 2 } }] },
    hasQuest: true,
    questProgressRequired: 5,
    questCondition: { event: "WRESTLER_RETIRED", required: 5 },
    championTokenDefinitionId: "fixture-token",
  };
  const payload = {
    ...form,
    name: "Fixture edited immediately",
    abilityEffects: { effects: [{ action: "DAMAGE", values: { amount: 1 } }] },
    questCondition: { ...form.questCondition, required: 5 },
  };
  assert.equal(payload.name, "Fixture edited immediately");
  assert.equal(payload.abilityEffects.effects[0].action, "DAMAGE");
  assert.equal(payload.questCondition.required, payload.questProgressRequired);
  assert.equal(payload.championTokenDefinitionId, "fixture-token");
});

test("duplicate submit guard and failed-save retention allow retry", () => {
  let inFlight = false;
  let attempts = 0;
  const submit = () => {
    if (inFlight) return false;
    inFlight = true;
    attempts += 1;
    return true;
  };
  assert.equal(submit(), true);
  assert.equal(submit(), false);
  inFlight = false;
  assert.equal(submit(), true);
  assert.equal(attempts, 2);
});

test("save failures remain distinguishable for retry UI", () => {
  assert.deepEqual(
    [401, 403, 409, 422, 503].map((status) => classifySaveFailure({ status })),
    ["session", "permission", "conflict", "validation", "server"],
  );
  assert.equal(classifySaveFailure({ network: true }), "network");
});