# AI survival and turn evaluation

The AI could choose immediate self-lethal over a nonterminal action when BOSS reply penalties made the latter score worse. It also valued expiring unspent gold and the opponent's automatic turn refresh/draw as a reason to sacrifice a weak wrestler into a surviving taunt.

The evaluator now keeps a nonterminal root whenever one exists, excludes losing continuations, reserves a simulation for END_TURN, and normalizes automatic phase changes in both turn scoring and public-reply scoring. Useful mutual kills, nonlethal self-damage, immediate/multi-action wins and hidden-information masking remain covered by tests.

The public-catalog BOSS run also exposed an engine exception: an expiring owner-turn health buff could retire a wrestler, finish the game via retirement effects, and then continue into the turn's normal draw. Turn start now stops at a terminal result before proceeding to subsequent phases.

Validation:

- Original survival reproductions: 5 failures across 8 cases (suicidal BOSS card play and wasteful attacks at all difficulties).
- Owner-turn expiry reproduction originally threw from drawCard after the game finished.
- 114 focused tests passed, covering all four difficulties, scheduler, Minion A, combat tactics, finishers, turn start and fatigue draws.
- Public catalog at verification: 182 cards and 11 champions. NORMAL: 100/100 matches finished. Original BOSS run: 99 finished, one interrupted by the turn-start exception above. Final BOSS run: 100/100 finished, no illegal actions, timeouts or interruptions (5,580 actions). Reports: `20261116-ai-survival-normal-100.md` and `20261116-ai-survival-boss-100.md`.
- Library, API and frontend type checks and production builds run before release.

Commands:

```sh
node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test artifacts/ko-game/src/game/actions/ai-survival.test.ts
KO_QA_API_ORIGIN=https://ko-card-game.onrender.com NODE_USE_ENV_PROXY=1 node --import ./docs/qa/checkpoints/20261006/qa-loader.mjs --test artifacts/ko-game/src/game/qa/ai-match-qa.test.ts
```

The full-match runner also accepts `KO_AI_QA_DIFFICULTY=NORMAL` and `KO_AI_QA_MATCH=29` for a faster profile run or a deterministic single-match reproduction. These do not change runtime AI configuration. These tests verify tactical examples and legal, terminating play; they do not establish optimal play for every card interaction.
