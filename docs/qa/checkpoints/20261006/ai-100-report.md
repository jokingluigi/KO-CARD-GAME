# KO AI Match QA

- API source: https://ko-card-game-vr69.onrender.com
- Published cards: 85
- Published Champions: 7
- matches requested: 100
- matches executed: 100
- success / failure / timeout / interrupted: 100 / 0 / 0 / 0
- action cap per match: 400
- total action steps: 6504
- total events: 23074
- seed range: 20260920..21044901
- deck templates exercised: 6
- first-player seats: player-1=50, player-2=50
- Champion pairings exercised: 42
- terminal statuses: FINISHED
- action types exercised: ATTACK, END_TURN, MULLIGAN, PLAY_TECHNIQUE, PLAY_WRESTLER, SELECT_EFFECT_TARGET, USE_ACTIVE, USE_CHAMPION_ABILITY

## Scenario coverage

- Decks are built from the current published catalog without tokens or Champion Tokens.
- Templates vary by catalog order, cost, attack, health, Technique-first ordering, and structured-effect presence.
- Published Champion pairings are rotated; player-1 and player-2 each receive the opening seat.
- Every chosen action is checked against `getLegalActions` and executed through `executeAction`.
- After every successful action, the input state immutability, board shape, card-instance uniqueness, health bounds, gold bounds, and event monotonicity are checked.
- Wrong-player actions and duplicate non-target-selection actions must be rejected without changing state.

## Failures and reproductions

- none

## Hidden-information probe

- AI actions are selected from `getLegalActions` and evaluated through `executeAction`.
- The evaluator receives the complete state object by design; this runner verifies action legality, but does not claim a complete information-flow proof.
