# Claude → Codex handoff: Hearthstone-style presentation pass (2026-11-19)

- Branch: `claude/battle-impact-vfx` (pushed). `production` fast-forwarded to `e5ea2170`.
- HEAD: `e5ea2170` = `47c3a137` (presentation work) + merge of `origin/production` `ee324cc6`
- Bundle: `ko-presentation.bundle` (range `origin/production..HEAD`). Apply: `git fetch ko-presentation.bundle claude/battle-impact-vfx` (or `git pull` from the bundle) on top of production `ee324cc6`.

## Scope / ownership
Presentation only. `git diff origin/production HEAD` touches only:
- `artifacts/ko-game/src/components/**` (presentation components, new `*-model.ts`, CSS)
- `artifacts/ko-game/src/audio/external-assets.ts` (+ test), `combat-hit-sound.ts`
- `artifacts/ko-game/src/index.css`, `src/battle-presentation.css`
- `artifacts/ko-game/public/vendor/hs-mixes/**` (CC0 mixes + `manifest.json` with sha256/provenance)

No changes to game rules, card/champion data (`src/game/**`), `lib/**`, `artifacts/api-server/**`, DB, migrations, payments or deploy settings. Nov 18 card/champion revisions from production are preserved (diff on those paths is empty).

## What changed (player-visible)
Impact bursts/damage splash/board cracks/camera kick/board hop; card-play lift-hover-slam; legendary vs champion arrivals (no banner over the card); spell rune circle + burn-away; finisher spell build-up; destroy shatter, retire dust, heal glow; YOUR TURN banner; coin toss (turn 1); burning rope (online, last 15 s); finisher-ready scene; HS-style result (portrait cracks/explodes + ribbon); readiness green glows; targeting arrow/reticle; stat/gold pops; stun stars/silence look; overdraw burn; fatigue card; VS slam; emote/bubble polish; board taps; low-health pulse; champion-sprite ability/hit/heal/awaken moments.

## Verification
- `pnpm run typecheck:libs`, ko-game `tsc --noEmit`: pass
- Tests (components, audio, admin-effects-20261118, champion-preparation-copy): 283 pass, 1 fail = pre-existing `action-history` "턴/드로우/퀘스트..." (fails on the base too). `player-ux battle-event-caption` is also pre-existing.
- `vite build`: pass
- Visual checks: slow-motion Playwright harness + practice lessons (local dev DB). Champion battle sprites were not available locally → sprite moments verified by type/build only.

## Deploy (done 2026-11-19 02:23 KST)
- Front static site `srv-damlm4gu01pc73ao3mb0` (ko-card-game-vr69) deployed `e5ea2170`, deploy `dep-dbuttujl550s73blg0f0` = live. Live hs-mixes files sha256-verified (40/40). API service NOT redeployed (unchanged).
- **Approval gate changed (owner request):** the front Build Command no longer hardcodes the approved SHA. It now requires env var `APPROVED_PRODUCTION_COMMIT` to equal `RENDER_GIT_COMMIT`:
  `node -e "if(!process.env.APPROVED_PRODUCTION_COMMIT||process.env.RENDER_GIT_COMMIT!==process.env.APPROVED_PRODUCTION_COMMIT){console.error('UNAPPROVED PRODUCTION REVISION');process.exit(1)}" && pnpm install --frozen-lockfile && pnpm --filter @workspace/ko-game build`
  To deploy a new front revision: set `APPROVED_PRODUCTION_COMMIT` to the full SHA, then trigger a deploy. Setting the env var itself triggers a deploy of the branch head.
- One intermediate deploy `dep-dbutrvm8bjmc73ahlseg` failed by design (old hardcoded gate); it never went live.

## Not done
- Pre-existing draft bounce test failure in `lib/game-engine/src/draft/mutations.test.ts` untouched.
- `claude_readonly` DB role password was shared in chat earlier; lock or delete it.
