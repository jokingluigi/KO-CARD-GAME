# Minion A acceptance checkpoint

Adds only champion-minion-a, published and using the existing starter grant path so ordinary players can select it. Base health uses the existing default 20; no invented portrait, quest, reward, upgraded ability, or token linkage. Idempotent migration 0034 never updates existing champions or cards.

Ability: 2 gold, “완전히 무작위 카드 1장을 내 손에 생성합니다.” Existing GENERATE, RANDOM, FULL, count 1 and existing instance generator. Full catalog is separate from ordinary random generation pools and persists in match snapshots. It includes validated cards from all DB statuses and the actual built-in Zombie token, with one entry per stable card ID. No ownership/deck/type/cost/rarity/status weighting. Existing uniform Fisher–Yates selection occurs on execution. Minion-only local matches receive a fresh RNG seed. AI scoring and beam search do not execute or inspect this ability's random result.

Invalid exclusions: missing/empty ID or name; invalid card type; noninteger, negative or nonfinite cost/attack/health; missing rules text; invalid keywords/tags/token flags/config; explicit deleted marker; unsupported/malformed effect actions/triggers/scripts/targets; conversion exception. Missing artwork is allowed. Zero-stat techniques are allowed. No publication, deck eligibility or token filter. QA/training definitions are not DB cards or production special cards.

Hands retain the existing 7-card overflow consequence: generated overflow is removed from game with OVERDRAW, without special storage or extra slots. Generated definitions and dependencies are resolvable from the saved complete catalog during restore. Original records remain unchanged.

Verified: 18 new engine tests (including all requested card categories, actual card effects, 6000-seed uniform coverage, exact cost, illegal actions, overflow, deterministic restore, AI blindness, actual NORMAL/HARD/BOSS turn scheduling, no hidden-choice catalog leak, built-in Zombie and unpublished dependencies), 451 isolated shared engine regression tests total, 3 migration/startup tests. Frontend/shared/API type checks and both builds pass. Network-dependent legacy QA files require a running catalog API; their first attempt failed with connection refused to localhost and is not a gameplay regression PASS.

Pending: live production list/selection/ability/card rendering; real AI match; mobile viewport; actual online reconnect. Do not report complete until pending acceptance checks are verified.
