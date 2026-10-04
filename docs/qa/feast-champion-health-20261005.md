# Feast champion HP correction — 2026-10-05 KST

User correction: Feast includes allied champion maximum HP. Preserve existing player-card HP buff behavior: current and maximum HP both gain 3, including injured champions (damage gap preserved). This is not healing; does not contribute to Helper overflow. Spell cost remains 4; no catalog ATK/HP/cost modified.

Implementation: existing SCRIPT_V1 adds a second BUFF on SELF PLAYER. Shared engine supports positive SELF PLAYER HP BUFF with synchronized champion health and maximum health and two STAT_CHANGED events. Stable Feast ID adapter upgrades historical configs without mutating raw records. Migration 0041 updates only Feast text/effectConfig, increments version once and preserves publication, original stats and all unrelated rows; rerun is idempotent.

PASS: 47 targeted tests, including injured/full champions, no allied wrestlers, opponent unchanged, exact cost, no healing overflow, real PGlite migration/persistence/idempotency. PASS: 1,024 full engine/current-catalog/AI continuation regression tests, zero failures/skips; frontend/API types and builds.
UNVERIFIED: post-deployment live UI (pending at commit), real phone. No production QA purchases, card deletion, user balances or original specifications modified.
