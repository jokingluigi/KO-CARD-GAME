# Raise champion frame top and expose more portrait

CSS-only presentation change. Frame/aperture top margins are reduced, keeping name/health chrome, champion target boxes, field and hand layout unchanged.

- Portrait mobile: frame top4→-4px; aperture top8→0px, adding8px visible image height (390×844:124→132px).
- Desktop: frame top18→2px; aperture top23→7px, adding16px (1440×900:353→369px).
- Short landscape: aperture top9→5px, adding4px while retaining compact chrome.
- Administrator MOBILE preview uses the same geometry. Explicit PC chrome now also uses desktop name/health sizes and72px aperture bottom when edited from a mobile browser; PC preview minimum canvas height480px keeps the frame visible.
- Source image, registered zoom/crop/position, skins, animation, game logic and DB remain unchanged.

Validation: before/after actual shared battle UI geometry at360×740,375×812,390×844,412×915,844×390,1440×900. Own/opponent target, name/health plate, field and hand boxes match exactly; every image aperture expands upward; no global overflow. Production frontend build passed. Existing sprite/admin real-UI browser checks passed390×844/1440×900 (mock admin persistence, local engine threats). Screenshots use local fixtures/temporary artwork, not all production champion art. Physical device, every uploaded sprite crop and live internet PvP were not newly tested.

Files: champion-portrait-frame.css, battle-viewport.css, mobile-champion-layout.css, admin-battle-sprites.css. No main merge or API deployment. Deployment receipt is separate.
