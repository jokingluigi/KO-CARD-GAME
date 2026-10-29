# Taller mobile champion frames

The previous top-inset adjustment left the mobile frame itself179×164px, so its wide/short silhouette remained. This change increases the actual mobile portrait/HUD height as well as the corresponding administrator preview.

At390×844, frame179.4×164→179.4×207.8px (+26.7% height); image aperture163.4×132→163.4×175.8px (+33.2%). The preview labelled390×844 uses exactly that new representative height. At375×812 the actual frame is193.4px tall; at412×915 it is232px tall. Short360px screens use a lower responsive height to keep field targets usable. Desktop and landscape remain unchanged.

Budget is recovered from stage gaps/padding, compact opponent hand header/control row and the player's hand strip. This is an explicit tradeoff: portrait hand cards are now62–73px tall (minimum44px wide); field card size is retained at all checked sizes. Full card information remains available via the small info corner, and the existing select/use/drag paths remain. Side quest panels are capped56px rather than filling all new HUD height. Guidance/cancel stays in the side rail.

Validation: geometry at360×740,375×812,390×844,412×915,844×390,1440×900 showed no global overflow or reduced field card widths versus the previous release. Existing full layout browser additionally checked360×640 and real Home admin test tools/restart390/1440. Corner-start field attack390 passed, as did hand spell drag360/375/390/412/1440, including selection, use button, invalid/cancelled play and horizontal hand scrolling. Administrator/shared battle sprite/skin/zoom/threat reaction suite passed390/1440 (admin API persistence mocked, battle uses local real engine). Frontend production build passed. No new engine unit test was needed for two CSS files.

Screenshots use local fixtures/temporary sprite artwork. Physical phones, final crop for every production sprite and live two-client PvP were not newly validated. Existing uploaded image files and per-skin alignment settings are untouched. No database, server rules, main merge or API deployment changes.

Files: `mobile-champion-layout.css`, `admin-battle-sprites.css`. Deployment receipt is separate.
