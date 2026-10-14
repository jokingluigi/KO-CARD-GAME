# KO AI Match QA

- API source: authenticated administrator snapshot; cards SHA256 d778e658eb9d050e817df4d8162179e3895ba5f96366a8783ce903e7b340ca74; champions SHA256 fab1b92ee6b8c9a915dbb7a50d29247733e2fc658d377591e51161fcb3dd9d83
- Admin card definitions: 165
- Admin usable Champions: 10
- matches requested: 100
- matches executed: 100
- success / failure / timeout / interrupted: 100 / 0 / 0 / 0
- action cap per match: 400
- total action steps: 5032
- total events: 17889
- seed range: 20260920..21044901
- deck templates exercised: 6
- first-player seats: player-1=50, player-2=50
- Champion pairings exercised: 90
- terminal statuses: FINISHED
- action types exercised: ATTACK, END_TURN, MULLIGAN, PLAY_TECHNIQUE, PLAY_WRESTLER, SELECT_EFFECT_TARGET, USE_ACTIVE, USE_CHAMPION_ABILITY

## Scenario coverage

- Decks are built from the current PUBLISHED/DRAFT administrator catalog without tokens or Champion Tokens.
- Templates vary by catalog order, cost, attack, health, Technique-first ordering, and structured-effect presence.
- Administrator Champion pairings are rotated; player-1 and player-2 each receive the opening seat.
- Every chosen action is checked against `getLegalActions` and executed through `executeAction`.
- After every successful action, the input state immutability, board shape, card-instance uniqueness, health bounds, gold bounds, and event monotonicity are checked.
- Wrong-player actions and duplicate non-target-selection actions must be rejected without changing state.

## Failures and reproductions

- none

## Hidden-information probe

- AI actions are selected from `getLegalActions` and evaluated through `executeAction`.
- The evaluator receives the complete state object by design; this runner verifies action legality, but does not claim a complete information-flow proof.
