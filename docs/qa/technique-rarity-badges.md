# Technique grades and EPIC border removal

Requested policy: techniques allow EPIC and TOKEN only. The shared type helper, runtime definitions, admin editor/filter, server card parsing and frame editor/save validation use this policy. Existing technique rows are normalized by idempotent startup migration 0038: ordinary techniques become EPIC, token techniques remain/become TOKEN. Wrestler grades, effects, publication status, ownership, decks and pack configuration are preserved. Existing techniques consequently use the existing EPIC duplicate limit of two; no deck is deleted or rewritten.

Removed only the synthetic EPIC violet outline. Upper rarity badges and configured frame artwork remain.

Verification: PASS — 27 isolated DB/domain/API tests, including repeated migration, all legacy technique grades, token flags, wrestler/deck/pack preservation, EPIC deck rules and draft integration. Shared TypeScript build, API/frontend typechecks and production bundles PASS. Deployment/browser checks pending at this checkpoint.
