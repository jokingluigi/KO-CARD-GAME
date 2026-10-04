# PvP event-batch resync correction — 2026-10-05 KST

FAIL → FIXED → PASS: the client tested every event against the same last accepted sequence +1. A valid server batch [10,11,12,13] following 9 triggered a false missing-event RESYNC at 11. RESYNC reset animations and action locks and forced an additional full snapshot. The new helper advances through consecutive events, skips accepted duplicates, preserves the last cursor on a real gap and prevents duplicate older batches from moving the cursor backwards. Draft HTTP sequencing exception is preserved.

PASS: actual sequencedEventsForViewer server output used to reproduce the old false-gap condition and verify the new helper. Real missing numbers still trigger resync. PASS: 38 online protocol, validation, lifecycle, presence, recap, sanitizer, ticket, recovery, draft polling and card-catalog tests. PASS: frontend types and build.
UNVERIFIED: two-account live PvP latency/frame benchmark and real phones. This fixes a demonstrated synchronization cause of interrupted play; does not claim that every source of lag is eliminated. No active user match was navigated, refreshed or acted in.
