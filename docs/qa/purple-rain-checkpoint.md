# Purple Rain checkpoint

Existing published/DRAFT champion named 퍼플레인 or 챔피언 퍼플레인 now normalizes to the requested rules when converted into a match definition. Existing ID, ability costs, portraits, audio, health and presentation remain. Existing match snapshots retain their original rules; start a new match for this checkpoint. No production catalog row was created or edited.

Base/upgraded ability selects own portrait or one allied wrestler and deals 1/2 damage. Portrait draws one and discounts only that drawn card by 1/2 (minimum zero). Allied wrestler gains 1/2 attack if still present. Shared target immunity, defense, armor, retirement and game-end rules apply.

Quest requires eight actual positive damage events on own portrait/wrestlers attributed to own CARD_EFFECT or USE_CHAMPION_ABILITY. Enemy effects, combat, fatigue and blocked damage are excluded. Multi-target damage counts each victim; damage amount does not multiply progress. Tower progress bonuses do not replace the required hits. Cursor processing prevents duplicate completion.

Validation: 10 Purple Rain tests and 388 combined engine/actions/effects/champions/Tower tests passed. Frontend/API TypeScript and production builds passed. Actual deployed browser gameplay and production catalog availability remain unverified due to the previously observed Work API connection block.
