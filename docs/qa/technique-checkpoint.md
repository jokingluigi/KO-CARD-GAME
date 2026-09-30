# Technique spell QA checkpoint

Validated on the existing shared engine, without modifying production catalog records.

- Existing targeted effect/cancellation/configuration checks: 101 passed.
- Added 11 actual hand-cast scenarios: ACTIVE and legacy ENTER_FIELD, single payment and replay rejection, heal cap/buff scope, destroy versus lethal retirement, precommit cancel/confirm, invalid target/turn/gold, reservation event retention, draw/summon sequence, champion lethal, queued cost increase and reduction.
- Fixed three reproduced problems: queued effect events were discarded; queued cost increases could produce negative gold; queued reductions were rejected before their new cost applied. Failed casts preserve the original hand/gold/reservations.
- Final shared engine, effects, AI and Tower regression suite: 378 passed, zero failed. Frontend typecheck and frontend/API builds passed. Isolated HTTP Tower and AI-deck smoke passed before the final cost-validation adjustment.
- This is engine QA. Actual production browser spell interactions and every saved production spell definition remain unverified; do not treat this as full catalog or mobile acceptance.
