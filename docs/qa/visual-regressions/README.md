# Reported visual regressions — repair candidate

Base33914f3; branchfix/battle-visual-regressions. No Production DB changes or deployment.

1/2: heavy/massive camera design zoom20%/26%; camera directional amplitude now2× the effective profile, capped44px (previous1.5×/32px). Off/Reduced behavior preserved. Stronger zoom20/26 was checked in the shared board at five viewport sizes; final additional shake multiplier has unit/build coverage, not a new full browser pass.

3: AI menu previously preloaded the complete champion catalog, while the4.5s intro clock did not wait for its selected portrait downloads. Removed all-catalog image prefetch in the AI route. Regular AI and quick AI now wait for the chosen original/skin pair before starting their local opening clock, with an8s bound so storage failures cannot create an infinite wait. Quick-AI continuation checks abort after the wait. No image/dialgoue data rewritten. Real network success under the user's reported conditions remains unverified; an8s timeout can still end with a fallback if the actual download fails. PvP server-clock timing is unchanged.

4: old attack-finisher-zoom/effect-finisher-zoom CSS applied a whole-stage scale and saturate/brightness filter while the new camera also changed the same scene. Removed those classes/style from the stage. Confirmed KO/portrait sequence remains. Browser finishing-attack/resize/unsupported-animation recovery tests passed; user's exact transparent-screen case still requires physical-device acceptance.

5: screenshot HP5 coincides with data-critical=true. Existing low-HP ::before paints the entire bottom35% of the stage; removed that broad background source and kept a local health-panel outline. Five viewport low-HP board tests confirmed no stage pseudo-background and captured retained wood. The blue color itself was not reproduced on desktop Chromium, so do not claim the precise mobile compositor cause is proven or every blue-board case solved.

6:1–2damage now uses the external Kenney punch-medium recording instead of generic-light. Existing SFX setting/priority remains. New taste/subjective strength unproven.

68 automated tests passed, full typecheck/build passed. Low-health shared-engine2/6/12damage browser attacks passed at360×740,375×812,390×844,412×915,1440×900; finish/recovery checks six viewports passed; intro fallback/late-original/skip tests three viewports passed. Tests for delayed selected-pair image loading and timeout bound passed. Controlled local battle fixture uses original artwork, not a real account/production battle. Actual all-mode/full-server/Android device acceptance is still pending. Initial typecheck rejected await in quick-AI nonasync callback; fixed before final build.
