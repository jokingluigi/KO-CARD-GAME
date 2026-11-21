# Repeating attendance and AI quest replay repair

## Attendance

Attendance now has an explicit cycle, starting at 1 for every existing claim. The existing last-day claim stays complete for its claim date; on the next claim date, the next cycle starts at the first enabled reward. Disabled/gapped definitions are skipped, and missed days preserve progress. The API and reward collector use the same position resolver, independent of query ordering. The UI describes the repeating track and current cycle.

Migration `0060_attendance_cycles.sql` is installed through the existing transactional startup installer: add cycle with default 1, create `(user_id, cycle, day_index)` uniqueness, remove both supported forms of the old one-time `(user_id, day_index)` uniqueness. Existing claims, dates, reward definitions and grants are preserved. `(user_id, claim_date)` uniqueness remains, and claim processing acquires a per-user transaction advisory lock before checking and granting. Repeated/concurrent requests pay once per Korean date. No real user claim was consumed as part of verification.

## AI quest replay

A reproducible path matches the reported message: invoke two attack callbacks against the same pre-render snapshot, with an attacker that retires during the first exchange. Both old callbacks accept and append the attack; authoritative sequential replay cannot find the attacker for the second action and throws `공격할 수 없는 선수입니다.`

Local human actions now use `dispatchLocalGameAction`, which reads and immediately advances the canonical state ref through the same `executeAction` dispatcher used by server replay. The component journals only successful results, so another callback cannot validate against the stale render. Existing animation geometry/selection code remains presentation-only.

For already recorded legacy duplicates, server replay recovers only an **adjacent, exactly identical attack** following a successful validated attack, and only when the engine rejects it as a removed/invalid target or an already consumed attack. It adds no events, damage or quest progress for that retry. First-action forgeries, changed targets, non-adjacent invalid attacks and other invalid actions remain rejected. Legal successive Multi Strike attacks still resolve twice. Both actor-tagged and legacy transcript paths are tested. The duplicated UI error prefix is removed. Existing failed records with this specific pattern can be retried; other validation failures are not bypassed.

The user's historical transcript was not supplied; the exact reproduction above establishes a real matching failure path, not access to that historical match.

## Validation

- Focused attendance/replay, startup migration and Leon regressions: **34 passed**.
- Quest-platform HTTP integration: **7 passed, 1 skipped**, no failure.
- Deployment guard: **11 passed**.
- Shared-library, API and frontend typechecks; API/frontend production builds passed.
- Legacy migration tested twice with both an old unique constraint and old unique index, preserving claim 1 and date uniqueness while allowing cycle 2.
- Shared engine's two `findLastIndex` uses were replaced with equivalent ES2022-compatible reductions so the library project typechecks without changing compiler targets or runtime behavior.

The prior environment-variable deployment approval tool is used for both services. Live revision and read-only attendance status checks follow after deployment.
