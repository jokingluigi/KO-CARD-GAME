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

Dynamic stat effects must carry their trigger context through the engine's pending-effect frame; `LAST_ATTACKER` is resolved from that context rather than from display text or card identity. End-of-turn abilities also need an explicit board-wide dispatch before the next turn starts.

**Why:** Attack-triggered values are only available at resolution time, and omitting TURN_END dispatch makes valid structured effects silently inert.

**How to apply:** Add the reference to the shared value resolver, preserve it through continuations, and test both the event-triggered stat change and the turn-end reset.