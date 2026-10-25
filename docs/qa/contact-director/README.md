# Contact-first revision (ongoing)

Production branch base remains abd6a4f; no deployment/Production DB changes. This extends physical-combat-overhaul rather than replacing game rules.

## Concrete changes

Attack contact now overlaps the target's near edge by up to28px rather than8px, retaining the target centre. Defender directional recoil is4/14/28/40px for light/normal/heavy/massive confirmed damage. Hitstop and the engine clock are unchanged.

BattleVfxDirector separates contact-art lifetime (640ms) from card-recovery/input-lock lifetime. It caps active effects at4, cancels timers on match unmount and clears on resize/hidden/preferences. It emits once from the existing impact callback. This fixes the previous design where dust disappeared when the attacker finished returning. Champion portrait recoil from the previous revision remains.

Effekseer official tutorial sample textures Smoke.png and HitEffect01_Yellow.png replace the generic Kenney smoke/flash for physical contacts. Pinned source URLs, hashes and official sample CC0 statement are in public/vendor/effekseer. The sample project was inspected: these are static authored textures used by a particle scene, NOT an animation atlas; initial investigation of a possible flipbook did not establish one. No false claim of a bespoke animated sprite sheet. Existing dark-wood board/card art remains.

SFX contact-heavy.wav layers Kenney punch/wood/low-frequency recordings; contact-massive.wav layers punch/glass/crunch. No oscillator/noise synthesis. Layers are mixed into one file to avoid independently starting HTMLAudioElements at contact; the redundant bass overlay was removed for attacks. Source filenames/licenses/hashes: public/vendor/impact-mixes/manifest.json and ../kenney. Final monoPCM16 22050Hz delivery peaks -8.54/-8.38dBFS (measured decoded samples). The initial Vorbis mixes overshot0dBFS and failed a new test; they were removed and replaced with gain-reduced lossless PCM. This is an objective peak measurement, not a listening or satisfaction result.

## Verification

45 automated tests passed. Production typecheck/build passed. Six-viewport animation checks passed, including that dust survives attack-root removal and each heavy contact plays one mixed file. Shared board plus actual engine action tests passed for2/6/12 damage in360×740,375×812,390×844,412×915,1440×900 (15 attacks), using original artwork from read-only cached API image downloads. Tests use controlled buff/health conditions; game card definitions are not modified.

Latest isolated PvP cosmetics/two clients/reload/fallback and AI setup/start regression passed. Tower KO→result→reward→swap passed. Parallel draft run encountered local route.fetch ECONNRESET after initial PvP display assertion; recorded as failed attempt, followed by a standalone rerun. See retry log for final result. No production users tested.

Actual board capture: qa-results/contact-final/battle-390x844.webm. Audio recording: audio-390.webm. Muxed battle-with-audio.webm uses file-start alignment and is NOT calibrated to the video capture start/hardware latency. Read-only uploaded reference excerpt: reference-contact.mp4. No claim that the mux proves precise synchronization.

## Outstanding quality gates

Reference comparison is still subjective and not accepted by the user. No claim of100% replication/AAA completion. All gameplay modes/events, direct champion recoil edge cases, original reported intro failure/blue-board cause, full-game UX and physical-device performance remain incomplete/unverified. Sample-based art and layered recordings now exist, but this alone does not meet the entire original master directive.

Standalone draft rerun passed both-client skins, image-emote transport, frozen loadout reload and mobile layout checks. The earlier connection-reset attempt remains recorded above.
