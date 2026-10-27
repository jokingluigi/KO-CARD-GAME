# Equipped skins in dialogue and champion presentation

Legendary and ordinary wrestler dialogue already used the speaking player's equipped card/token skin. Champion ability cinematics and quest awakening presentation still used raw champion images, and cinematic images did not apply equipped framing or recover to an original image after a failed skin request.

Changes:

- Champion ability cinematics resolve the actor by authoritative player ID before champion definition ID (important in mirror matches), then use the existing normal/awakened skin selector.
- Quest cinematic and standalone before/after portraits use the same equipped skin selector and framing. Reward token preview now supplies the owner and card ID to the existing card renderer.
- Cinematic requests carry optional framing and original-image fallback. The existing `CardArtwork` handles rendering and failed-skin fallback. Card summon cinematics pass their already-selected skin's framing and original image as well.
- Card effect finishers resolve the source card's actual owner before choosing its skin.
- Existing skin ownership, base/awakened-slot policy and original artwork/data remain unchanged. No asset records, game rules, DB or server changes.

Validation:

- New actual shared battle browser test at 390×844 and 1440×900: own/opponent legendary dialogue, champion ability, quest awakening, mirror ownership, custom scale/position, default artwork and broken-skin original fallback; awakened opponent ability.
- Existing champion quest dialogue browser checks: mobile/desktop and reduced motion, real completion, no replay, optional empty lines, defeat suppression.
- Existing cosmetics browser regression: eight groups including real authenticated local PvP on two clients, equipped images/emotes, reload, broken-image fallback and AI setup/start.
- Full workspace typecheck/build; 20 quest/cinematic policy/media tests and three cosmetic framing tests.

New browser images use explicit test SVG fixtures to identify source selection, not new runtime art. No physical-device test or exhaustive live draft/tower run is claimed. The entrance cinematics are not independently asserted by this new fixture; its legendary dialogue is checked. Standalone quest presentation/source-card finisher wiring is inspected and built; these branches are not separately exercised by the new browser suite.
