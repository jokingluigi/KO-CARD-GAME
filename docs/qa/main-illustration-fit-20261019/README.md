# Main-menu illustration fit

The registered background used `cover` on desktop and a fixed 680px background height on mobile, cropping the illustration according to the viewport. The original asset now renders with `object-fit: contain`; a dark, blurred duplicate fills desktop margins. The left gradient ends beside the menu instead of dimming most of the artwork. Mobile places the full-width, naturally proportioned illustration above the unchanged menu. Short desktop screens scroll the menu without enlarging the illustration.

Only main-menu markup and presentation CSS change. The illustration asset, content settings, game logic, authentication, fonts, and database remain unchanged. The generated concept image is not used.

## Validation

- Frontend TypeScript check and production Vite build passed.
- Actual Chromium rendering with read-only downloaded current public background (1804 × 872), local API fixtures, no production login or writes.
- Viewports: 1911×920, 1440×900, 1280×600, 360×740, 375×812, 390×844, 412×915.
- All seven passed: original fits completely, no horizontal page overflow, mobile illustration precedes the menu, no browser JavaScript exceptions, notices expand, sound settings open, lower menu buttons remain reachable.
- [Desktop rendering](desktop.png), [mobile rendering](mobile.png), [layout measurements](results.json).
- Mobile emulation only; physical-phone testing was not performed. Existing menu elements can still overlay the left part of the illustration on desktop; this change prevents image cropping, not all menu overlap.
