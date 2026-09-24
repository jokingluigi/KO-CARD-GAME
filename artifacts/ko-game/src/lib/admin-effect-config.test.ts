import assert from "node:assert/strict";
import test from "node:test";
import {
  EffectConfigApplyError,
  effectConfigEntryCount,
  mergeGeneratedEffectDraft,
} from "./admin-effect-config";

test("append preserves an existing structured effect AST", () => {
  const previous = [{ trigger: "ENTER_FIELD", action: "DRAW", values: { amount: 1 } }];
  const merged = mergeGeneratedEffectDraft(
    "STRUCTURED_EFFECTS_V1",
    JSON.stringify({ effects: previous }),
    { effectId: "STRUCTURED_EFFECTS_V1", effects: [{ action: "HEAL" }], scripts: [] },
    "append",
  );

  assert.equal(merged.effectId, "STRUCTURED_EFFECTS_V1");
  assert.deepEqual(merged.effectConfig.effects, [...previous, { action: "HEAL" }]);
});

test("append treats a missing Champion effect slot as empty without hiding malformed configs", () => {
  const merged = mergeGeneratedEffectDraft(
    undefined,
    null,
    { effectId: "STRUCTURED_EFFECTS_V1", effects: [{ action: "HEAL" }], scripts: [] },
    "append",
  );

  assert.deepEqual(merged.effectConfig.effects, [{ action: "HEAL" }]);
});

test("append preserves an existing SCRIPT_V1 AST and displays its count", () => {
  const previous = [{ version: "SCRIPT_V1", trigger: "TURN_START", steps: [] }];
  const merged = mergeGeneratedEffectDraft(
    undefined,
    { scripts: previous },
    { effectId: "SCRIPT_V1", effects: [], scripts: [{ version: "SCRIPT_V1", trigger: "TURN_END", steps: [] }] },
    "append",
  );

  assert.deepEqual(merged.effectConfig.scripts, [
    ...previous,
    { version: "SCRIPT_V1", trigger: "TURN_END", steps: [] },
  ]);
  assert.equal(effectConfigEntryCount(merged.effectConfig), 2);
});

test("incompatible execution modes reject append without changing existing data", () => {
  const previous = { scripts: [{ version: "SCRIPT_V1", trigger: "TURN_START", steps: [] }] };
  assert.throws(
    () => mergeGeneratedEffectDraft(
      undefined,
      previous,
      { effectId: "STRUCTURED_EFFECTS_V1", effects: [{ action: "HEAL" }], scripts: [] },
      "append",
    ),
    (error: unknown) => error instanceof EffectConfigApplyError && /기존 SCRIPT_V1 AST/u.test(error.message),
  );
  assert.equal(previous.scripts.length, 1);
});

test("card-level execution ID mismatch rejects append instead of relabeling the old AST", () => {
  assert.throws(
    () => mergeGeneratedEffectDraft(
      "STRUCTURED_EFFECTS_V1",
      { effects: [{ action: "DRAW" }] },
      { effectId: "SCRIPT_V1", effects: [], scripts: [{ version: "SCRIPT_V1", trigger: "TURN_START", steps: [] }] },
      "append",
    ),
    (error: unknown) => error instanceof EffectConfigApplyError && /실행 형식/u.test(error.message),
  );
});

test("malformed or unknown existing config fails explicitly in append mode", () => {
  assert.throws(
    () => mergeGeneratedEffectDraft(
      undefined,
      "{not json",
      { effectId: "STRUCTURED_EFFECTS_V1", effects: [{ action: "HEAL" }], scripts: [] },
      "append",
    ),
    EffectConfigApplyError,
  );
  assert.throws(
    () => mergeGeneratedEffectDraft(
      undefined,
      { effects: [{ action: "DRAW" }], unexpectedMetadata: true },
      { effectId: "STRUCTURED_EFFECTS_V1", effects: [{ action: "HEAL" }], scripts: [] },
      "append",
    ),
    EffectConfigApplyError,
  );
});

test("replace deliberately switches execution format and omits the old AST", () => {
  const replaced = mergeGeneratedEffectDraft(
    "STRUCTURED_EFFECTS_V1",
    { effects: [{ action: "DRAW" }] },
    { effectId: "SCRIPT_V1", effects: [], scripts: [{ version: "SCRIPT_V1", trigger: "TURN_START", steps: [] }] },
    "replace",
  );

  assert.equal(replaced.effectId, "SCRIPT_V1");
  assert.equal(replaced.effectConfig.effects, undefined);
  assert.equal(replaced.effectConfig.scripts?.length, 1);
});

test("auto-apply and save/reload preserve executable DSL only, never provider interpretation", () => {
  const providerDraft = {
    effectId: "STRUCTURED_EFFECTS_V1" as const,
    effects: [{ trigger: "ENTER_FIELD", action: "DRAW", values: { amount: 1 } }],
    scripts: [],
    interpretation: {
      trigger: "ENTER_FIELD",
      target: "player hand",
      action: "draw one card",
    },
  };
  const applied = mergeGeneratedEffectDraft(undefined, null, providerDraft, "replace");
  assert.deepEqual(applied.effectConfig, { effects: providerDraft.effects });

  const reloaded = JSON.parse(JSON.stringify(applied.effectConfig)) as unknown;
  assert.deepEqual(reloaded, { effects: providerDraft.effects });
  assert.equal(JSON.stringify(reloaded).includes("interpretation"), false);
  assert.equal(JSON.stringify(reloaded).includes("analysis"), false);
});

test("entry count supports both stored execution formats", () => {
  assert.equal(effectConfigEntryCount({ effects: [{}, {}] }), 2);
  assert.equal(effectConfigEntryCount({ scripts: [{}, {}, {}] }), 3);
  assert.equal(effectConfigEntryCount("{bad json"), 0);
});