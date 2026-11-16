# Notices

**Hugo Duprez.** `src/core/sim.js` and the effects that say so at the top of their file adapt Sprite Fusion's
open-source pixel art VFX (https://www.spritefusion.com/pixel-art-vfx), Copyright (c) 2026 Hugo Duprez, MIT License.

**Hollow Crown.** `src/core/act.js` adapts how Hollow Crown plays its skills (poses on 12 fps steps, hit-stops, the springy
straw target), from
https://github.com/rehan-remade/hollow-crown, Copyright (c) 2026 rehan-remade, MIT License.

**Patch Pixel.** The font in `gallery/fonts` is Patch's own and is not covered by this repository's MIT license. See
`gallery/fonts/NOTICE.md`.

## KO CARD GAME baked library

`library/*.png` contains 137 offline exports of PIXELFX effects at revision
`5294518ce7c72e48b6100a744596e0acf57f2826` (https://github.com/patch-gg/pixelfx).
Original source IDs and integrity hashes are in `library-manifest.json`.
Exports use transparent backgrounds and a neutral card carrier for actor-dependent
masks; stock humanoid actors and gallery fonts are not included. Runtime playback
uses the generated atlases rather than evaluating upstream effect code.

## KO art direction set

`ko/*.png` is original KO CARD GAME artwork rendered with the pinned PIXELFX
painter. `ko-manifest.json` records 21 content hashes. The shared palette and
card-oriented shapes are authored in `scripts/vfx/ko-art-direction.mjs`.
