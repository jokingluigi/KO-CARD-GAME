# Combat audio, quest completion and camera follow-up — 2026-10-25

## Changes and causes

- Generic EFFECT and REMOVE cues had been assigned Kenney's electronic maximize/minimize sounds. HEAL and QUEST_COMPLETE used confirmation tones; BLOCK used a sci-fi force-field tone. Removed the generic/confirmation sounds from these battle cues and changed BLOCK to the existing physical metal recording. Effect text, events and VFX remain. These are confirmed electronic bindings; the precise sound heard on the user's device was not independently identified.
- Crusaders' positive low-health condition accepted zero HP. The quest event processor now requires survival for awakening/positive self low-health quests. A lethal hit produces defeat without a new completion, reward or awakening. Previously completed quests are not undone.
- Low-damage hits now use `vendor/impact-mixes/contact-light.wav`: three existing external CC0 Kenney recordings (heavy punch, wood body, medium punch), short envelope, peak -3.35 dBFS, no synthesized audio. The manifest records sources, bytes and SHA-256. Larger damage retains the separate heavy/massive mixes.
- Legendary entrance audio gain is multiplied by 0.85; its landing impact is 54 instead of 65 and bass 58 instead of 70. User volume/mute settings still apply. Added the missing external mapping for `impact-very-heavy.wav`.
- Quest presentation previously looked up a player using `playerId OR championId`; mirror matches could select the wrong player. Music similarly selected the first identical champion, including an incomplete one. `quest-media.ts` resolves the actual completing player, preserves the most recent enabled completed music and handles older reconnect snapshots. Home, online and tower use the selector. Tower previously never selected quest music. Repeated requests for an already pending track no longer restart its crossfade.
- Completed portrait selection is shared between the HUD and quest scene. The two active players' configured completed images are warmed in advance. A read-only production catalog check found completed portraits enabled/configured only for Pandora and Belmort; other champions deliberately keep their configured original image. No champion records or media flags were changed.
- Contact camera zoom fractions are now 0.075/0.14/0.26/0.34/0.38 by damage tier. The directional kick multiplier increased from 2 to 2.6, capped at 58 px before viewport attenuation. Off/reduced motion behavior and identity recovery remain.
- Visual inspection also caught an opaque black rectangle behind the RGB Effekseer contact texture. Its original file is additive art, unlike the RGBA smoke. The renderer now caches a one-time emission-alpha conversion rather than drawing its black matte as opaque. Original assets are unchanged; this is not a CSS background override.

## Validation

- Production typecheck/build passed.
- 136 targeted tests passed: audio lifecycle/gain/crossfade, external provenance and file hashes, camera accessibility/recovery, attack timing, quest media selection, published champion mapping and awakening engine behavior.
- Actual ATTACK actions at 6 HP tested against both Oct 14 and Oct 24 Crusaders definitions: 1 and 5 damage complete while surviving; exact lethal 6 and excess lethal 10 do not complete, emit completion or start awakening.
- Shared actual board/engine browser attacks (2/6/12 damage) passed at 360x740, 375x812, 390x844, 412x915 and 1440x900. Stage, attack actor and contact VFX used the same camera frames; animations detached and damage matched engine results. Contact and recovery screenshots were inspected, including the corrected transparent texture. Measurements are DOM bounds/animation samples, not a device FPS benchmark.
- With the read-only live catalog and cached original media, `quest-media-browser.mjs` verified both enabled champions in mirror matches at 390x844, 360x740 and 1440x900: only the completed opponent's HUD switches image, the correct MP3 advances playback, and the other champion retains its original image. This is a shared-component/media harness, not a full authenticated quest-completion match in every mode.
- Isolated actual HTTP/WebSocket PvP browser regression passed: two authenticated sessions, skins, image emotes, reload and missing-image fallback.
- Isolated draft browser regression passed: seat-specific skins/backs, emote delivery, frozen equipment on reload, mobile fit.
- Isolated tower browser regression passed: mobile KO → result → reward → 25-card swap. The tower suite does not complete each champion quest.
- A broader test run initially exposed a pre-existing stale assertion that raw attack cannot change anticipation. The existing impact profile intentionally adds up to 15ms windup; the corrected test verifies equal damage-tier duration/hitstop while allowing that bounded anticipation difference. No production attack timing was changed to satisfy the test.

## Limits

No physical Android/iOS test or subjective listening/user study was performed. The stronger punch's perceived quality is for user review. Full quest completion was not exercised in every authenticated AI/PvP/draft/tower route; engine, selector, actual media playback and shared rendering were checked separately. Some fixture hand images are intentionally absent and return 404; selected field/champion test art was loaded and checked. No Production DB writes, card/champion record changes or reward changes were performed.
