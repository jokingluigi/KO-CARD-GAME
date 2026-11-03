# Make champion-token silence immunity discoverable — 2026-11-03

The prior badge was small and detail notices were below large artwork. More importantly, the card-name reference popup had no immunity notice at all. Guide content alone did not solve those actual information paths.

## Changes
- Shared notice immediately after the card name in battle inspector, collection/card detail, and card-name reference popup, before artwork. Explicit summary: “침묵으로 능력과 키워드가 제거되지 않습니다.” Clearly distinguishes damage, stun, destroy and vanish from silence.
- Existing field-card badge has a minimum 9px font, stronger padding and an explicit test identifier. It remains decorative and does not intercept targeting/drag input.
- Collection tiles forward actual token/protection identity to the shared renderer. No inference based on artwork or name.
- Champion collection details use the existing card-name reference component for ability/quest text and expose the existing linked-card browser. Linked token buttons display “침묵 면역” when applicable and open the same detail dialog. The linked-card section in card details moves below the main information, preserving title/rule priority.
- Same authoritative rarity/token rule as the engine. No game rule, immunity scope, card definition, reward or account data changes.

## Validation
- 11 rule/protection tests passed (champion-token silence rules and presentation condition). Ordinary tokens and non-token champion rarity remain excluded unless explicitly granted runtime immunity.
- Existing linked-card/player-tool policy tests: 3 passed.
- Full project typecheck and frontend production build passed.
- Browser through actual common admin test-match UI, collection and reference dialogs at 390×844, 844×390, 1440×900. Current published card/champion API responses captured read-only are used as isolated fixtures. Checked visible notice without scrolling, before-artwork order, board badge font, nested card-name reference, collection detail, ordinary card exclusion and champion → linked token → detail. No page errors.
- The workflow uses actual existing cards: 하늘을 떨구는 자(각성) → 위마리(각성), plus 챔피언 마왕 벨모르트 → 마왕 벨모르트(강림). No example cards added to the game.
- Screenshots in [evidence folder](20261103-immunity-visibility/). Artwork requests are blocked by the isolated API fixture, so missing-artwork placeholders in these screenshots are not evidence of a production image failure.

## Scope and limits
Frontend presentation only; existing work branch retained, no main merge or DB changes. Browser accounts and combat responses are isolated fixtures, not real-user production matches. Deployment receipt and deployed-assets browser result will record final release verification.
