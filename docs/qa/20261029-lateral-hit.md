# Horizontal strong-hit recoil and slower low-health shivering

Frontend presentation only. Strong champion hits (actual damage>=5) now alternate horizontally in a short decaying recoil rather than holding a diagonal knockback. The initial side follows the source horizontal component, or the player side when the source is vertical. Later swings reduce to80/62/45/29/16/7% before restoring the current resting posture. Existing damage-dependent force, timing, profile controls, same-skin expression selection and priorities remain.

The shared camera uses corresponding horizontal kick/recoil for strong damage impacts, preserving contact zoom and current damage intensity. No vertical travel or camera rotation is added to those impacts. Summon and awakening camera direction stays unchanged; normal1–4 damage keeps its existing source direction. This is achieved by reusing the current camera controller, not adding another global shake.

Low-health shivering period increases400→520ms (same amplitude/tilt). Breathing, paused shivering during reactions, health-based return, reduced-motion and screen-shake OFF settings are retained.

Validation:

- 100 sprite/motion/impact/combat regression tests passed; frontend typecheck/build passed.
- Real shared battle UI with local engine damage at390×844 and1440×900. Confirmed5/8/12-damage body translationY=0 and whole-board camera translationY=0, with significant horizontal movement. Normal hit direction, increasing damage intensity, OFF and reduced-motion checks passed.
- Low-health computed animation duration0.52s checked. Actual damage during low health pauses tremor, return atHP1–5 resumes it, actual recovery4→6 stops it.
- Temporary diagnostic skins used. Included mobile video is silent and records actual local battle effects, not final uploaded-art/physical-device/internet-PvP validation.
- No gameplay/data/server/API changes; no main merge. Deployment receipt is separate.

Files: champion-sprite-motion.ts/.test.ts, champion-sprite-visual.css, screen-impact-policy.ts/.test.ts, docs/qa/strong-champion-impact-browser.mjs.
