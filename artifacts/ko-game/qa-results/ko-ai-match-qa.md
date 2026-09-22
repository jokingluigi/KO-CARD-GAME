# KO AI Match QA

- API source: http://127.0.0.1:8080
- Published cards: 45
- Published Champions: 4
- deterministic action steps: 61
- final status: FINISHED
- winner: player-1
- action types: END_TURN, USE_CHAMPION_ABILITY, PLAY_WRESTLER, ATTACK
- event count: 210
- failures: none

## Hidden-information probe

- AI actions are selected from `getLegalActions` and evaluated through `executeAction`.
- The evaluator receives the complete state object by design; this runner verifies action legality, but does not claim a complete information-flow proof.

