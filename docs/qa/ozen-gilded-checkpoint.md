# Ozen and Gilded Master repair

Observed production originals: Ozen DRAFT v10, cost 2 1/3, effectId empty/config {}; Gilded Master DISABLED v10, cost 2 1/1, effectId empty/config {}, current text explicitly hand-only. Preserve these statuses/text/stats/media. Migration 0032 backs up whole originals and installs structured entrance effects once, preserving later edits on restart.

Gilded legacy fallback/publication repair now follows current hand-only wording, retaining hand/deck scope for older wording explicitly mentioning deck. ALL uses valid count one (selection ALL affects all matches); old count 100 failed admin validation. Ozen excludes both champion tokens and CHAMPION rarity cards via additive excludeChampionRarity filter, plus direct-deployed Champions. No eligible target is a no-op; retirement follows existing retirement/graveyard effects rather than destruction.

Admin-only single-card tests for these two include published catalog definitions as targets: real expensive/cheap hand cards for Gilded, real low/high cost opponents for Ozen. Existing production gameplay and card data are unaffected by test seeding.

Passed: 476 engine/action/effect/quest/Tower/structured validator and persisted DB tests. Frontend/API typechecks and builds passed. Live deployment and browser checks pending. Original status remains unpublished; effects becoming operational does not publish these cards.
