# Flat intro portrait rendering — 2026-10-26

## Evidence and limits of the diagnosis

The new user screenshot shows vertical purple/gray bands rather than the loader label. Both published originals were fetched through the production frontend's actual storage URL and visually inspected as valid 1086x1448 RGB PNG illustrations:

- Purple Rain: e2e1a4d1-5b44-4b2e-866a-a8f410db7307.png, SHA-256 8dc9548d79764bd5a24911a67e3b7342ba10c36158a5e8db6f2b4be41656d507.
- Crusaders: 691c3635-2e16-485f-bed7-c0b6f76c8a34.png, SHA-256 c6be6f30151e1a22515ece22a6f683213b1344833a71c77304ec44182ddc00b9.

The current loading fallback contains neither that stripe pattern nor a card-back asset. Checking only successful loading/naturalWidth and desktop screenshots was insufficient for the user's symptom. The earlier response overstated the extent of that fix.

History identifies a20dfec adding `perspective(900px) rotateY(3deg)` to the portrait frame on top of existing bitmap filtering, clipping and compositing. This is a concrete change from the earlier flat display path. A device-specific compositing failure is a plausible explanation for a successfully loaded image painting incorrectly. The actual purple-band failure was NOT reproduced on the Linux browser host; the specific physical GPU/driver cause remains unproven. This patch removes the risky compositing path rather than claiming a network retry fixes corrupted paint.

## Implementation

Only the intro component and its scoped stylesheet change at runtime:

- Remove the frame's 3D perspective/rotation and the player translateZ promotion.
- Remove bitmap color filters, mirrored bitmap scaling and screen blending around the portrait.
- Do not clip the bitmap surface. A separate, static SVG draws the same chamfered corner decoration.
- Keep the image at contain, untransformed and unfiltered; talking-player emphasis dims the identity text instead of compositing the full bitmap group.
- Keep a short opacity/relative-top entrance. Backwards-only fill returns to ordinary flat paint after entry instead of retaining a transformed surface.
- Retain the previous bounded loader, late original/skin behavior, existing dialogue, clocks and skip callbacks.

The accepted in-HUD KO implementation is unchanged. No original image, champion/card record, combat rule, server path or DB schema changed.

## Verification actually performed

- Production typecheck/build passed.
- 11 targeted portrait loading/preparation and AI dialogue mapping tests passed.
- Actual Home AI entry with isolated API fixtures used ADMIN role and the exact Purple Rain / Crusaders champion pair. 360x740, 375x812, 390x844, 412x915 and 1440x900 passed; mobile viewports use touch/mobile emulation and deviceScaleFactor 3. These are Linux Chromium runs, not physical Android devices.
- At elapsed 1200/2100/3100ms (self dialogue, opponent dialogue, VS), every image and ancestor through the intro root was checked for transform:none, perspective:none, filter:none, clip-path:none, normal blending and opacity:1. Both original image URLs and decoded dimensions were checked. Skip still reaches mulligan.
- Screenshot centers were compared against the actual source PNGs at normalized 64x80 resolution to tolerate browser subpixel resampling. Twelve comparisons passed a mean absolute RGB error threshold of 12/255 (observed 1.315–10.547), and retained vertical image detail (49.7–63.2), unlike uniform vertical bands. An initial 96x128 comparison was overly sensitive to resampling at the smallest CSS size; normalization was corrected without relaxing the error threshold. This is a rendered-content check, not proof of behavior on the user's GPU.
- Original delayed-image, failed skin/original, changed source, dialogue and skip regression passed at 390x844, 360x740 and 1440x900.
- The accepted KO regression passed at 390x844 for own and opponent defeat: 40 fragments at the HUD rectangle, outward motion, hidden original after fracture and busy-state release.
- The frozen-clock paint test initially failed to enter mulligan because its clock remained before gameplayStartsAt after skip. Advancing the fixture clock past that boundary fixed the harness; no production clock behavior was altered.

No authenticated production match or physical-device test was performed. This is a tested flat-rendering recovery candidate; confirmation that the user's device no longer displays bands remains outstanding. No Production DB writes were performed.

## Review

[Purple Rain / Crusaders, flat rendering at VS](https://raw.githubusercontent.com/jokingluigi/KO-CARD-GAME/039c2e5e9f58a416e1df8c7dff86ecf9e4126f4b/intro-flat-purple-crusaders-20261026.png)
