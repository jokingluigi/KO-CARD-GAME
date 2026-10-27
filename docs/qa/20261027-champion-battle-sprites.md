# Champion dialogue sprites — review branch, no deployment

Branch: `feat/champion-battle-sprites`. Neither main merge nor production deployment/migration was performed for this task.

## Actual implementation

The real shared `GameStatePreview` champion target boxes now contain `ChampionBattleActor`. Own HUD/actor is on the left below the fields; opponent HUD/actor is on the right above them. Four slots per side, card renderers, hand size, handlers, instance IDs and original target refs remain. Hit/shatter geometry continues to use those real refs. Decorative actor layers do not intercept input. The battlefield stays the approved wood/cloth theme; the reference image's illustrative example data was not imported.

Dedicated sprite manifests are optional. Runtime tries equipped skin sprite, champion default sprite, equipped/existing portrait, then name. Missing reaction frames use `default`; failed image decoding advances to the next candidate. The previously displayed image remains during decoding, frames are preloaded, and match keys reset cursors/timers. No dedicated production sprite was created or registered.

Reaction events: summon, attack declaration, confirmed champion damage, retirement of a legendary or 5+ cost ally, ability, quest awakening, victory/defeat. This definition of a major ally avoids reacting to every small retirement. Short reactions last 700ms, awakening 1800ms; higher-priority reactions reject minor replacements. There is no replay queue. Reconnect starts at the current event cursor, while quest/result expressions derive from current state. During an attack the hit pose waits for the existing contact signal; no server/timer/presentation lock is introduced. Damage values and rules remain authoritative existing bindings.

## Storage and administration

No new tables/columns. Champion manifests live in the existing `presentationLines.BATTLE_SPRITE` presentation JSON. Skin manifests live in `imageAssets.__battle`, alongside existing display metadata. Both travel through the existing champion/loadout paths. URLs are validated and server save reuses the existing decoded-upload asset verification. Base champion and skin registration require administrator permissions.

1. Champion management → dialogue/presentation section, or cosmetics management → edit a champion skin → **대전 대화용 스프라이트**.
2. Select `default`; upload PNG/WebP up to 5MB through the existing signed-upload/complete flow. Transparent upper-body art should be used for final content.
3. Select own/opponent preview. Set scale, horizontal/vertical anchor, optional fill crop and explicit flip. No automatic mirroring. Values are stored separately for each side and expression.
4. Add optional `hurt`, `ability`, `awakened`, etc. Map each battle event using its expression selector; unset events use default.
5. Save the existing champion/skin editor. Replacement preserves placement; expression removal clears its mapping. Removing default clears the full manifest, not the original champion artwork or stored image files.

## Evidence / actually executed

- Full workspace typecheck and build passed.
- Manifest validation/priority tests: 2 passed, covering missing default/reaction, invalid URLs/ranges and major-event priority.
- Isolated PostgreSQL-compatible storage/API suite: 24 passed (existing fixture/pack regressions plus actual champion/skin save/read/unregister, loadout propagation, invalid mapping/external-image/nonadmin rejection).
- Actual administrator Chromium flow passed: image upload, per-side flip/framing, reaction mapping, save/re-entry and unregister. Uses a local test image, not a final sprite.
- Actual authenticated two-client PvP/AI cosmetics regression: all eight groups passed, including reconnect, frozen skins, emotes, failed image fallback and AI match setup/start. These mode tests do not prove every new expression event on both network clients.
- Shared real battle component + real engine browser: 360×740, 375×812, 390×844, 412×915, 1440×900, 844×390; diagonal layout and no horizontal overflow. Actual engine ATTACK/ability events verified champion HP 20→18 and actor HIT/ABILITY. Also verified broken skin sprite → default champion sprite → illustration fallback with explicit QA metadata.
- Existing 390×844 intro/KO suite passed: delayed image retry, skip, both outcomes, actual target shatter, input release, reconnect no replay.

## Screenshots / video

Before: [prior actual shared battle UI](screenshots/20261027-skins-captions/champion-caption-390.png). This is an earlier test state, not the identical match snapshot.

After: [390](screenshots/20261027-battle-sprites/after-390.png), [360](screenshots/20261027-battle-sprites/after-360.png), [desktop](screenshots/20261027-battle-sprites/after-desktop.png), [admin editor](screenshots/20261027-battle-sprites/admin-editor.png).

[Hit/ability MP4](screenshots/20261027-battle-sprites/hit-ability-engine.mp4) records the actual shared UI with real engine actions in a controlled QA match state. It is silent, uses existing portrait fallback artwork, and is NOT a recording of an authenticated network PvP match or final facial-expression art. Actual network-mode checks are listed separately above.

## Not yet verified / limitations

- Dedicated transparent dialogue sprites are still absent. Final appearance, facial readability, expression alignment, asymmetric designs and awakening art need verification after real assets are registered.
- No physical device/user study or mobile GPU timing/long-session memory benchmark. Separate viewports were checked; uninterrupted orientation-change drag accuracy and frame-level HP/VFX/audio synchronization were not measured.
- Full tower/draft/test-match flows and every reaction on two live network clients were not executed. Shared integration alone is not reported as those mode tests passing.
- The existing vertical/scrolling board structure remains on desktop and mobile; this is not the reference image's full landscape arena redesign. Registration includes per-side/per-expression crop settings, but no separate saved mobile-versus-desktop placement profiles.
- No new game rules, rewards, deck content, state icons, sample characters or production assets were added.
