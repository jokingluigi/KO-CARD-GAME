# Card introduction / lore — 2026-11-13

Optional `cards.lore` is separate from effect text/configuration. Additive idempotent startup migration 0059 adds a non-null text column with empty default for existing cards. The admin API accepts up to 5,000 UTF-16 code units; omitting the field preserves existing lore during older-client updates, while an explicit empty string clears it. No card stories were invented or written into production.

Admin → Cards → create/edit → Basic information → **카드 소개 · 로어 (선택)**. Live preview shows the same introduction component used in card details. Saved introductions appear in collection/deck card detail and the battle inspector; tag explorer, history, graveyard/hand-overflow detail adapters preserve the field. Blank introductions are hidden. Plain React text preserves paragraphs and escapes markup. Effect compiler/keyword rendering still use only effect text; card frames and battle rules do not gain lore text.

Validation: 19 focused SQL/API/engine regression tests pass, including a real migration from a dropped legacy column (isolated PGlite only), repeated migration, create/read/update/clear, old-client preservation, validation boundaries, public/collection/deck transport and unchanged engine abilities. Prior token/absorption/Sovereign checks pass in the same run. Shared/API/frontend typechecks and production builds pass; diff whitespace check passes.

Browser: actual administrator card component with real authenticated HTTP and disposable SQL; 390×844, 844×390, 1440×900. Create, live preview, save, reload/reopen, publish (isolated only), collection detail, literal markup without script execution, unchanged effects and no horizontal overflow verified. Screenshots use an intentionally blank-art QA card and temporary test prose. Physical devices and production battle frame rate were not measured. Battle inspector wiring is implemented; separate browser evidence, if executed, is recorded separately.

Production deployment and version verification are recorded after completion. No main merge; no manual production content changes. Schema addition uses the existing authorized startup migration path.

Additional battle browser verification passes at 390×844, 844×390 and 1440×900: the actual shared battle board's card information button opens the inspector and displays the current catalog's saved introduction. See `battle-inspector-browser.json`. No combat or screenshot-only duplicate renderer was substituted for the inspector.

## Production receipt

API and frontend live revision: `941b65a59847337333e36024fdb79a08b06e69d3`. Public cards and authenticated admin/collection/deck-option responses all expose string lore fields; actual root and fresh battle entry scripts match the approved revision. No production card content was written. The frontend release helper initially rejected stale `/version.json`; Cloudflare served the previous value until the observed cache age reached 300 seconds, then returned the correct new revision. Independent final verification passed afterward; no rollback or repeat deployment was used. No main merge. Later documentation-only commits are not deployed.
