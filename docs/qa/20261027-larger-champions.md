# Larger champion actors — 2026-10-27

Follow-up on `fix/champion-arena-composition`; no merge or production deployment.

Changed only `champion-battle-actor.css` and these QA artifacts. At 1440px the champion target/image area grows from 210×300px to 288×400px. At 390px it grows from approximately 148×138px to 179×200px. Compact landscape height grows from 200px to 280px. Desktop wings grow responsively up to 320px; the portrait HUD reserves actual additional height instead of allowing actors to cover field cards or buttons. Skin/expression selection, image framing settings, game events and hand-card sizing rules are unchanged.

`node docs/qa/champion-arena-browser.mjs`: passed all seven viewports (360×740, 375×812, 390×844, 412×915, 844×390, 1024×768, 1440×900), no horizontal overflow or actor/field or hand/field overlap, no page errors. Pointer attack on the relocated champion and hand-to-slot summon passed at 390px and 1440px. This uses the real shared component and local game engine, not live network matches. Final frontend build passed.

Before: [mobile](screenshots/20261027-champion-arena/mobile.png), [desktop](screenshots/20261027-champion-arena/desktop.png).
After: [mobile](screenshots/20261027-larger-champions/mobile.png), [desktop](screenshots/20261027-larger-champions/desktop.png).

Larger portrait HUD rows increase vertical scrolling on phones. No dedicated transparent sprites have been registered: these screenshots still show existing illustration fallbacks. Final real-sprite silhouettes and physical-device performance remain unverified. No additional live PvP/AI/tower/draft tests were run for this CSS-only change.
