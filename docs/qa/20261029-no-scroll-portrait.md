# Taller in-game mobile portraits without scrolling

The user chose to preserve one-screen play and allow smaller field cards. The prior 45dvh formula made a 208px portrait in the 390×844 preview shrink to 170px in a real-browser-sized 393×760 viewport. The actual shared battle stylesheet now maintains 208px from 716px available height upward, retains the existing 232px ceiling on tall phones, and reduces the portrait only on shorter viewports to reserve usable field targets. Selected/idle modes use the same height budget. Desktop and landscape rules are unchanged.

Measured in Chromium through the actual shared battle component (read-only API fixtures):

| CSS viewport | Portrait height | Field card size | Vertical overflow |
|---|---:|---:|---|
|360×640|170|45.8×64.2|none|
|360×740|208|54.4×76.2|none|
|375×812|208|80.1×112.2|none|
|393×760|208|61.6×86.2|none|
|390×844|208|90.5×126.7|none|
|412×915|232|96.0×134.3|none|
|844×390|134|55.8×78.2|none|
|1440×900|448|157×219.8|none|

The regression script resizes the same page through portrait, landscape, desktop and back to 393×760, asserting document/root overflow, both portrait heights, aperture height, minimum 44px field width and hand bounds. This exercises the shared in-game UI, not merely admin preview. Screenshot uses the QA battle fixture without registered champion artwork; it proves geometry, not final character composition.

Validation: frontend production build passed. Field input script checks touch/mouse selection, pointer-following attack, champion targeting, illegal actions, cancellation, information popup, unchanged selected-field dimensions and absence of console errors. Short 393×760 info-corner drag run passed separately. The initial suite timed out on its fixed-pixel selection tap at 390×844; a repeat passed that viewport but timed out at 412×915. The final ordinary tap now uses the same proportional effect-text position as the earlier selection test, instead of an invariant (18,45) point across differently sized cards. Full input cases passed at 360×640,360×740,375×812,390×844,393×760; separate final runs passed at 412×915,844×390 and1440×900. The test-coordinate change is QA-only; production click handlers were not changed. Hand spell/targeted/wrestler drag, cancellation, horizontal hand scrolling and Use actions passed at 360×740,375×812,390×844,412×915 and1440×900.

Limitations: browser emulation, no physical phone test, no fresh two-client production PvP or full tower/draft campaign. No game rules, data, source artwork, skin selection, reaction logic, admin settings or DB changes.
