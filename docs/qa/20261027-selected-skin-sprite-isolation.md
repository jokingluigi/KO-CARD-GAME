# Selected-skin sprite isolation

Branch `fix/selected-skin-sprite-isolation`, based on the existing unmerged sprite/state-set work. No main merge, deployment or production writes.

## Changed behavior

`championSpriteSkin` resolves champion -> actual equipped CHAMPION_SKIN matching that champion -> this skin's manifest. If no cosmetic is selected, a logical `default:<championId>` skin owns the existing champion presentation manifest. This does not create inventory/catalog items or change ownership.

A selected cosmetic never inherits the champion's base sprite manifest, reaction bindings, thresholds or awakening set. No-sprite selected skins prefer their own existing artwork. KEEP preserves their normal artwork; REPLACE uses only their registered awakened set. Optional existing awakened illustration is selected within that skin when appropriate. Only after skin artwork is absent/fails are ordinary original-image/name fallback rules used; default-appearance sprite frames are never inserted as fallback for another selected skin.

Within a selected set, the shared state/reaction selector remains authoritative. Candidate failures now try that same set's default before same-skin illustration. Missing normal/awakened HIT/ABILITY does not borrow another skin or the normal set's expression. Preloading is limited to the resolved skin's two sets. Loaded-image identity includes the skin AND current appearance set, preventing an old skin/set's decoded image from flashing during a transition.

Administrator editors already save each item's manifest independently and use the shared state selector. Labels now explicitly distinguish the edited skin from the logical default skin in champion administration. No migration, new ownership grants, champion abilities, quest rules or awakening judgments were changed.

## Actual validation

- Full typecheck/build passed.
- Eight unit tests passed: existing sprite policy plus selected/default skin isolation, no-sprite skin artwork preference, partial normal/awakened sets, KEEP, default-frame failure order and wrong-champion target rejection.
- Twenty-five isolated DB/API tests passed. New actual PvP server test equips different skins on the same champion for two authenticated fixture users, checks both viewer snapshots, different KEEP/REPLACE and framing settings, changes equipment after start, evicts/reloads runtime and verifies frozen skin manifests remain identical. Test inventory restoration is restricted to local fixture accounts.
- Shared UI browser at mobile four sizes, desktop and landscape passed attack/ability/layout and updated image-failure checks. A broken selected-skin sprite now falls to illustration rather than the champion base sprite; explicitly selecting default appearance uses that default manifest.
- Two separate actual shared-UI viewports with reversed player ordering passed skin IDs, one awakened REPLACE set versus another KEEP set, and same-snapshot IDLE restoration. Marker PNGs are QA fixtures, not registered production art. This verifies rendering viewpoints, not two live WebSocket event streams.
- Actual administrator browser passed upload, framing/flip, state mapping, save/re-entry, per-item awakened-set persistence, missing-reaction awakened fallback, timeout return and unregister.

[Actual administrator preview](screenshots/20261027-skin-isolation/admin-preview.png).

## Limits

Dedicated champion dialogue sprite assets are still absent, so final artwork, silhouette differences, face alignment and perceived quality require real asset registration. The new server snapshot/recovery and viewpoint-rendering checks are separate; an exhaustive two-browser live expression-combat match and full tower/draft runs were not executed. Earlier documented healing/event-classification limitations are unchanged by this skin-selection correction.
