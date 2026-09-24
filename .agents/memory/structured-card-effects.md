---
name: Structured card effects
description: Durable safety and compatibility rules for administrator-authored KO card effects.
---

New administrator-authored card effects use a versioned, validated structured-data format. Display text is never interpreted during a match, and unsupported or partially understood text cannot be applied.

**Why:** Silently inferring a partial effect from natural-language text creates cards whose displayed behavior differs from gameplay. Executable code generation would also create an unacceptable security boundary.

**How to apply:** Preserve legacy effect IDs for existing cards. For new mechanics, extend the parser allowlist, server validator, typed runtime registry, human-readable preview, and regression tests together. Never use dynamic JavaScript execution or card-name checks.

Numeric values must be resolved from the matched action clause, never from the full multi-effect sentence.

**Why:** Target counts and earlier effects can otherwise be silently reused as the amount of a later damage, draw, gold, or cost action.

**How to apply:** Keep target-count parsing separate from action-value parsing and add a multi-clause regression case whenever a new numeric action is registered.

When a newly supported semantic pattern overlaps with the analyzer's broad unsupported-mechanic detectors, explicitly exempt the supported pattern from those fallback checks.

**Why:** Broad detectors such as “교환”, “서로”, or “변환” can otherwise downgrade a correctly parsed structured effect to `mechanism_required`.

**How to apply:** Reuse the same canonical pattern for action recognition and unsupported-mechanic exclusion, then test both the production wording and a close paraphrase.

For multi-effect sentences, preserve action order by sorting recognized clauses by their position in the source text, and scope target filters to the clause that describes the target action. Do not let a later `생성된 카드` damage clause turn an earlier random summon into a Generated-only pool.

**Why:** Analyzer-wide text scans can bind a later effect's filter or numeric value to the wrong action, changing both the preview and runtime behavior.

**How to apply:** Extract action values from the matched action phrase, and for special target shapes such as adjacent random summons, derive filters from the target clause before the summon verb. Cover exact production wording and a multi-effect regression.

Dynamic stat effects must carry their trigger context through the engine's pending-effect frame; `LAST_ATTACKER` is resolved from that context rather than from display text or card identity. Turn-start and end-of-turn abilities both need explicit board-wide dispatch.

**Why:** Attack-triggered values are only available at resolution time, and omitting TURN_END dispatch makes valid structured effects silently inert.

**How to apply:** Add the reference to the shared value resolver, preserve it through continuations, dispatch `TURN_START` after the new player refreshes, and test both turn-boundary triggers.

Deferred one-shot effects should be represented as validated queued structured effects in game state, then consumed when the matching normal play action succeeds; they must not be inferred from turn boundaries or card names.

**Why:** “Next card” effects can survive multiple turns and need exact once-only consumption without changing unrelated turn, combat, or generated-card rules.

**How to apply:** Register the queue action and its trigger/value schema, enqueue on the source trigger, consume only for the matching hand-play path, exclude the source instance from the matching event, remove only entries actually consumed, and cover persistence plus one-time application in runtime tests.

Champion admin effect fields may omit an explicit natural-language Trigger, but the API should inject a default Trigger only for an explicit Champion effect context; Card Admin input remains strict.

**Why:** Champion effects are invoked by the champion ability or quest flow rather than by their display prefix, while silently relaxing all effect inputs would make card analysis and validation ambiguous.

**How to apply:** Send `sourceType` and `effectSlot` from Champion fields, analyze the bare body through the shared parser, and keep the resulting structured effect subject to the same server validator.

In Korean target phrases, `자신이 선택한 선수/대상` describes the player making the choice, not a SELF-owned target. Treat it as the default opposing selectable target; reserve SELF ownership for explicit phrases such as `자신의`, `자신에게`, or `자신을`.

**Why:** Confusing the chooser with the target owner makes single-target Champion abilities select the wrong side while leaving the displayed sentence unchanged.

**How to apply:** Resolve owner from explicit target qualifiers and zone/card nouns, then apply `PLAYER_CHOICE`; keep hand-target phrases explicitly scoped to the owner's hand.

When a structured effect adds a new destination or random-pool filter, update both explicit-definition and random-generation paths, then reanalyze persisted card text against the live catalog.

**Why:** The analyzer can produce a valid payload that still loses its destination or filter in a separate runtime branch, and persisted cards do not benefit from parser changes until they are explicitly refreshed.

**How to apply:** Cover registry metadata, server validation, runtime target resolution, random generation, database reanalysis, and exact production wording in one regression set.

Natural-language analyzer coverage must include the production trigger aliases, Korean particles, and trailing connective wording—not just the central nouns and verbs.

**Why:** Small wording differences such as `출현`, `턴 시작`, `카드에게`, or `체력이 +2` can otherwise produce an empty or partial result even when the runtime already supports the mechanic.

**How to apply:** Add exact production-phrase regressions for each newly recovered catalog effect, assert `success`/`supported`, and pair target-zone changes with a runtime test that verifies the declared source zone.

Persisted-effect audits are diagnostic, not bulk migrations. Analyzer differences are context-sensitive; preserve valid legacy scripts and semantically equivalent stored data, and repair only exact, reviewed snapshots through version-checked effect-only saves.

**Why:** Reanalysis can expose real text/effect drift alongside harmless normalization, custom legacy implementations, or ambiguity. Treating every difference as a defect can change gameplay beyond the verified intent.

**How to apply:** Match the analyzer context used by the save path, verify the text, version, effect shape, and references before each repair, and leave unsupported or ambiguous rows unchanged.