# Champion facing policy — 2026-10-28

The user's latest instruction replaces manual per-side mirroring: own champion uses the original image direction, opponent is horizontally mirrored. This is a viewer-relative policy, so the same player is original on their own client and mirrored on their opponent's client.

The real battle actor applies the policy to registered sprites and existing-art fallbacks, irrespective of legacy flip flags. The administrator projects both normal/awakened sets into self.flip=false/opponent.flip=true, and stores those flags with subsequent sprite saves/uploads. Individual flip checkboxes were removed; size, position and crop remain independent. No production manifests were edited. Preview mirrors the outer figure like the battle actor, keeping image scaling/anchor operations inside it.

Original image files, ownership, chosen skins, reactions and game rules are unchanged. Source convention is right-facing artwork for the own champion; this is horizontal mirroring, not automatic recognition of the depicted face's direction.

Validation: 29 sprite/event/skin tests passed, including normal/awakened saved orientation and newly added frames while preserving scale. Frontend typecheck/build passed. No new browser or physical-device verification was performed for this change. Earlier screenshot reports describe their historical revision.

No deployment, main merge or production database changes.
