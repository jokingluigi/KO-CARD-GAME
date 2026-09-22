# KO AI Match QA

- API source: http://127.0.0.1:8080
- Published cards: 43
- Published Champions: 4
- matches requested: 100
- matches executed: 100
- success / failure / timeout / interrupted: 51 / 0 / 0 / 49
- action cap per match: 400
- total action steps: 5505
- total events: 20296
- seed range: 20260920..21044901
- deck templates exercised: 6
- first-player seats: player-1=50, player-2=50
- Champion pairings exercised: 12
- terminal statuses: FINISHED
- action types exercised: ATTACK, END_TURN, PLAY_WRESTLER, SELECT_EFFECT_TARGET, USE_ACTIVE, USE_CHAMPION_ABILITY

## Scenario coverage

- Decks are built from the current published catalog without tokens or Champion Tokens.
- Templates vary by catalog order, cost, attack, health, Technique-first ordering, and structured-effect presence.
- Published Champion pairings are rotated; player-1 and player-2 each receive the opening seat.
- Every chosen action is checked against `getLegalActions` and executed through `executeAction`.
- After every successful action, the input state immutability, board shape, card-instance uniqueness, health bounds, gold bounds, and event monotonicity are checked.
- Wrong-player actions and duplicate non-target-selection actions must be rejected without changing state.

## Failures and reproductions

- match 3: seed=20276758, decks=2/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=77, error=player-2 Champion health is out of range
- match 4: seed=20284677, decks=3/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=65, error=player-1 Champion health is out of range
- match 11: seed=20340110, decks=4/1, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=67, error=player-1 Champion health is out of range
- match 14: seed=20363867, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=49, error=player-2 Champion health is out of range
- match 17: seed=20387624, decks=4/1, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-1, result=INTERRUPTED, actions=40, error=player-2 Champion health is out of range
- match 18: seed=20395543, decks=5/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-2, result=INTERRUPTED, actions=68, error=player-1 Champion health is out of range
- match 25: seed=20450976, decks=0/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=61, error=player-1 Champion health is out of range
- match 26: seed=20458895, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=38, error=player-1 Champion health is out of range
- match 29: seed=20482652, decks=4/1, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-1, result=INTERRUPTED, actions=56, error=player-2 Champion health is out of range
- match 30: seed=20490571, decks=5/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-2, result=INTERRUPTED, actions=65, error=player-2 Champion health is out of range
- match 32: seed=20506409, decks=1/4, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-2, result=INTERRUPTED, actions=35, error=player-1 Champion health is out of range
- match 34: seed=20522247, decks=3/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=50, error=player-1 Champion health is out of range
- match 36: seed=20538085, decks=5/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=61, error=player-1 Champion health is out of range
- match 37: seed=20546004, decks=0/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=52, error=player-2 Champion health is out of range
- match 38: seed=20553923, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=41, error=player-1 Champion health is out of range
- match 40: seed=20569761, decks=3/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=43, error=player-1 Champion health is out of range
- match 43: seed=20593518, decks=0/1, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-1, result=INTERRUPTED, actions=43, error=player-2 Champion health is out of range
- match 44: seed=20601437, decks=1/4, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-2, result=INTERRUPTED, actions=46, error=player-1 Champion health is out of range
- match 45: seed=20609356, decks=2/1, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=62, error=player-1 Champion health is out of range
- match 46: seed=20617275, decks=3/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=65, error=player-1 Champion health is out of range
- match 48: seed=20633113, decks=5/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=43, error=player-2 Champion health is out of range
- match 49: seed=20641032, decks=0/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=59, error=player-2 Champion health is out of range
- match 50: seed=20648951, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=61, error=player-1 Champion health is out of range
- match 60: seed=20728141, decks=5/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=55, error=player-1 Champion health is out of range
- match 61: seed=20736060, decks=0/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=68, error=player-2 Champion health is out of range
- match 62: seed=20743979, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=38, error=player-2 Champion health is out of range
- match 64: seed=20759817, decks=3/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=55, error=player-2 Champion health is out of range
- match 66: seed=20775655, decks=5/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-2, result=INTERRUPTED, actions=80, error=player-1 Champion health is out of range
- match 68: seed=20791493, decks=1/4, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-2, result=INTERRUPTED, actions=58, error=player-1 Champion health is out of range
- match 69: seed=20799412, decks=2/1, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=35, error=player-2 Champion health is out of range
- match 70: seed=20807331, decks=3/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=42, error=player-1 Champion health is out of range
- match 71: seed=20815250, decks=4/1, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=87, error=player-2 Champion health is out of range
- match 72: seed=20823169, decks=5/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=67, error=player-2 Champion health is out of range
- match 74: seed=20839007, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=45, error=player-1 Champion health is out of range
- match 75: seed=20846926, decks=2/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=47, error=player-2 Champion health is out of range
- match 77: seed=20862764, decks=4/1, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-1, result=INTERRUPTED, actions=49, error=player-2 Champion health is out of range
- match 80: seed=20886521, decks=1/4, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-2, result=INTERRUPTED, actions=50, error=player-1 Champion health is out of range
- match 81: seed=20894440, decks=2/1, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=58, error=player-2 Champion health is out of range
- match 82: seed=20902359, decks=3/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=51, error=player-1 Champion health is out of range
- match 84: seed=20918197, decks=5/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=52, error=player-1 Champion health is out of range
- match 85: seed=20926116, decks=0/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=57, error=player-1 Champion health is out of range
- match 86: seed=20934035, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=44, error=player-2 Champion health is out of range
- match 88: seed=20949873, decks=3/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=48, error=player-2 Champion health is out of range
- match 90: seed=20965711, decks=5/4, Champions=3cbb09c4-f8ac-4668-9378-5c01bfa9474b/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-2, result=INTERRUPTED, actions=54, error=player-2 Champion health is out of range
- match 91: seed=20973630, decks=0/1, Champions=bcffab96-f61f-497e-b60b-de5a869837d3/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-1, result=INTERRUPTED, actions=45, error=player-1 Champion health is out of range
- match 94: seed=20997387, decks=3/4, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/11ac192a-d48d-4119-a63d-f9102793fb9a, first=player-2, result=INTERRUPTED, actions=51, error=player-1 Champion health is out of range
- match 95: seed=21005306, decks=4/1, Champions=0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f/3cbb09c4-f8ac-4668-9378-5c01bfa9474b, first=player-1, result=INTERRUPTED, actions=57, error=player-2 Champion health is out of range
- match 98: seed=21029063, decks=1/4, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/bcffab96-f61f-497e-b60b-de5a869837d3, first=player-2, result=INTERRUPTED, actions=39, error=player-1 Champion health is out of range
- match 99: seed=21036982, decks=2/1, Champions=11ac192a-d48d-4119-a63d-f9102793fb9a/0e9d8ab0-9af7-4db3-a03e-ff6ee3d5789f, first=player-1, result=INTERRUPTED, actions=60, error=player-1 Champion health is out of range

## Hidden-information probe

- AI actions are selected from `getLegalActions` and evaluated through `executeAction`.
- The evaluator receives the complete state object by design; this runner verifies action legality, but does not claim a complete information-flow proof.

