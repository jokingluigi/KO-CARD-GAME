# Reference-based combat revision — ongoing

Reference: newly uploaded Hearthstone shorts MP4 was downloaded and is accessible; 720×1268,~21.27s. Original game assets/audio were not copied. Prior consecutive-frame observation around11.5–12.3s remains applicable: a clear attacker, a local contact flash, dust persisting into return, readable defender response. No claim of subjective listening evaluation.

Changed production attack presentation:
- Removed attack-triggered cinematic queue request, which previously began a full-screen environment/camera treatment before contact. Also removes pre-contact FINISHER panel from this attack path; existing confirmed result/KO system remains. This removes one known screen-tint source, not proof that the separately reported blue-board bug is fully solved.
- Removed illustration breakout, unrelated ghosts and long decorative trail. Physical card frame remains the moving actor.
- Champion attack now animates the actual portrait DOM matching captured target geometry; cleanup cancels the animation to restore its transform. No champion data or results changed. This specific champion path still needs targeted gameplay acceptance.
- External Kenney smoke/spark/dirt images animate as a fast contact burst plus larger settling cloud. Preload occurs at attack mount to reduce first-hit missing textures. No homemade audio/VFX asset added.
- Defender recoil raised from3/7/12/18px to4/10/20/28px by actual damage. Existing visual hitstop/attack timelines remain; no server timer change.

Validation:
-44 automated tests passed; six-viewport animation browser run passed joint stop/recovery/callback/audio ordering.
-Final production typecheck/build passed. Initial build exposed a narrowed-union comparison error; corrected.
-Actual shared GameStatePreview and executeAction path ran2/6/12damage attacks at390×844,360×740,1440×900 (9 attacks), asserting the engine result and no ATTACK cinematic overlay. This is a local controlled battle fixture, not an authenticated live PvP match. Fixture health/attack values represent test conditions; no production card values changed.
-Original RiverDunk/Bodba and champion PNGs were downloaded read-only into local artwork cache; no logo replacement in final board footage. First static-host downloads timed out; direct API downloads succeeded. Earlier QA attempts failed for a JSX brace and missing generation options; both were fixed before the successful runs. Production build does not compile dev QA entrypoints, so browser execution was necessary.
-Actual HTMLMediaElement audio was routed into MediaRecorder; audio was not synthesized. battle-with-audio.webm combines captures at their file start; start offset/hardware latency is uncalibrated, so it does not prove precise output synchronization. Silent board video plus separate audio are also retained.

Evidence: qa-results/reference-board/battle-{width}x{height}.webm, audio-{width}.webm, contact-*.png. Rendering now uses actual original artwork, unlike earlier independent logo-card animation videos.

Still pending: subjective reference comparison/listening review, calibrated audio capture, physical phone tests, whole-game overhaul, all death/KO/ability/summon sequences, outstanding production intro/blue-background reproduction. Do not call overall project or reference quality complete. No deployment/main merge/Production DB mutation performed.
