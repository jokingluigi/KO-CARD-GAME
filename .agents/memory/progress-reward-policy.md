---
name: Progress reward policy boundary
description: Server-authoritative match, daily quest, and attendance rewards remain configurable until product policy declares live values and scope.
---

The reward framework must not invent production economy values or eligibility rules. Match rewards currently require a canonical server-finished result, and daily quests/attendance use the shared currency reward path with persisted idempotency. Keep live amounts, eligible match modes, daily timezone, and cumulative-versus-streak attendance behavior in authoritative configuration until product policy is confirmed.

**Why:** The product requirements explicitly prohibit guessing reward amounts, mixing client-local results into server rewards, or inventing attendance reset behavior.

**How to apply:** Before enabling live rewards, configure and verify the match settings, daily boundary timezone, quest pool, attendance definitions, and any additional match-mode policy in development.