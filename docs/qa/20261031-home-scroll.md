# Home menu nested scrollbar fix

## Cause and fix

At widths >=768px, premium-presentation.css constrained the home content to `100dvh - 120px` and gave it `overflow-y:auto`. This introduced a nested vertical scrolling panel. Its implicit horizontal overflow also became `auto`; the full-width KO heading's skew extended beyond the content width, creating a second scrollbar at the panel's bottom. This matches the reported inset vertical/horizontal scrollbar geometry.

Remove the desktop nested scrolling rule and allow content to expand in normal document flow. Give the skewed logo intrinsic width (`fit-content`) instead of skewing a full-width block. The home content can shrink with `min-width:0`. The menu's appearance and functionality are preserved; the page retains ordinary vertical scrolling so no lower menu items or announcements are hidden. No global scrollbar hiding or battle layout changes.

At 1440×900 before the fix: content client width 570px, scroll width 591px; height 780px versus scroll height 1018px, overflow auto on both axes. After: width and scroll width both 570px, height and scroll height both 1018px, overflow visible. The document grows naturally to 1138px height.

## Validation

Real home route and MainMenu component with mocked authenticated user, API responses, and six notices. Before/after Chromium measurements at 360×740, 390×844, 844×390, 768×1024, 1024×768 and 1440×900. Repeated all six after cases with an existing local illustration as test background.

All 12 after cases passed: no horizontal document overflow; no nested home content scroll; wheel scrolling moves the page; expanding notices increases page height without horizontal overflow; lower pack menu remains reachable. No page errors. Production frontend build passed. Physical Windows browser scrollbar styling, Android/iOS and live-account sessions were not separately exercised. Headless screenshots use the browser's scrollbar rendering, so widths/overflow/scroll ownership measurements establish the regression rather than claiming an exact visual match to Windows native scrollbar chrome.

- [Before desktop](20261031-home-scroll/before-desktop.png)
- [After desktop](20261031-home-scroll/after-desktop.png)
- [After mobile](20261031-home-scroll/after-mobile.png)
- [Before metrics](20261031-home-scroll/before.json), [after metrics](20261031-home-scroll/after.json), [illustrated metrics](20261031-home-scroll/after-illustrated.json).
- Runner: `node docs/qa/home-scroll-browser.mjs`, Vite port 5186; `ILLUSTRATED=1` tests a registered-background-shaped fixture. No game/user data or API implementation changed. No main merge.

## Release

Frontend-only deployment is live at source commit `e292b07f97cbc7a7162d2cc4bccacbe6966e0ddb`; all 109 JavaScript/CSS artifacts match the local production build SHA-256 hashes and the site's health endpoint returned 200. No backend redeploy was necessary for this CSS-only change. Receipt: [frontend deployment](20261031-home-scroll-front-deployment.json).
