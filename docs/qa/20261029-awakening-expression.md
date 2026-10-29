# Optional quest-completion expression

The user explicitly added an awakening expression to the existing ten-expression specification. The normal set now has an optional eleventh `awaken` slot. The dedicated awakened set retains its ten combat slots. Existing upload, removal, per-side size/crop controls, storage validation, skin ownership and editor persistence APIs are reused. No schema migration, DB writes or server rule changes.

Behavior shared between actual battle and admin preview:
- Confirmed quest completion displays the selected skin's normal-set `awaken` image, if registered.
- KEEP: after the transition, it becomes that skin's idle/default appearance. Hurt, heal etc. return to it; registered low-health and victory/defeat expressions retain priority. Missing reactions use this new default.
- REPLACE: display the normal-set quest expression for1500ms by default, clamp configured AWAKEN timing to1000–2000ms, then choose exclusively from the dedicated awakened set. Its missing expressions use its own default.
- Missing quest artwork retains the pre-existing220ms set transition (70ms with reduced motion). Registering no new art changes no existing appearance.
- Registered transition artwork remains readable for its configured duration even with reduced motion; movements still honor reduced motion.
- Reconnect restores current quest/skin state directly; no replay. A new match restores its normal state. Existing reaction timers, priority and game lifecycle cleanup are reused; the timer never delays gameplay/network updates.

Admin: Sprite management → champion/selected skin → normal set → expression `각성` → existing transparent PNG/WebP registration and alignment → save. `각성 외형` chooses KEEP/REPLACE. REPLACE still requires a dedicated awakened default. Advanced response timing `각성 표정·전환` controls the1000–2000ms interval. Existing ten slots remain available.

Validation:
- Cosmetics library declarations rebuilt; frontend typecheck and production build passed.
-104 existing/new policy, skin, motion, event, camera and combat tests passed. Added assertions for KEEP idle/low/missing reaction, normal hold versus isolated replacement set, timing clamping/reduced motion, projection/serialization, result priority and skin-local failure order.
- Chromium390×844 and1440×900 actual shared battle component: confirmed quest-event snapshot → quest expression → KEEP persistence or delayed replacement, reconnect and new-match reset passed.
- Actual admin route with mock API: eleventh normal slot, per-expression scale edit, save and re-entry retain optional frame; passed on mobile/PC. First attempt correctly found Save disabled without a dirty edit; the script now changes scale before saving. This is mock persistence, not production DB verification.
- Diagnostic artwork reuses local QA PNGs. No final champion-specific awakening art has been created/registered. Screenshots prove expression selection/layout only. No physical phone, fresh live two-client PvP, full real quest completion campaign or production admin write tested.

Backend is not redeployed: its existing generic manifest parser already accepts the optional frame key, AWAKEN mapping,11-frame count and timing range. All new semantics live in shared frontend resolution; existing server validation/authentication remains unchanged.
