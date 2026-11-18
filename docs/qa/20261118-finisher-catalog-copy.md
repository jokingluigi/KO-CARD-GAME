# Finisher display regression and Joker v45

Owner reported Rosie/La Calavera showing pre-finisher ability upgrades or absent preparation conditions after release b105423, then requested implementation of corrected Joker administrator text and mandatory clarification of future typos.

Evidence: public champion questCondition/reward fields matched the pre-release capture. Calavera still linked `2f47b929-7035-4bb9-abea-0af6a6f9c72d` (Ultimate Undead); Rosie still linked Assemble/Mimic branches. This was not an observed production DB rollback. Catalog pages rendered legacy `questRewardText` and empty shared `questText` without checking finisher links, so they could show stale upgrade copy despite a live finisher. The branch reward banner could also fall through to the internal zero-gold placeholder.

Changes:

- Collection and deck champion details derive preparation/reward copy from validated finisher choices/links before legacy text. Hide obsolete upgraded-ability copy for linked finishers.
- Reward banners show branch finishers, and only the selected branch after completion.
- Related-card discovery includes explicit finisher card references so the linked cards are inspectable.
- Saved administrator data and quest rules were not rewritten for this display correction.
- Joker v45 changed the exact reviewed text from 토튼 to 토큰. Match the owner-corrected latest wording, retain Surprise/Authority attack combo/conditional protection, and exclude champion tokens rather than every Champion-rarity wrestler.
- Add persistent instruction to consult the owner about future typos/ambiguous effect descriptions before implementing an interpretation or rewriting their text.

Validation:

- Whole workspace typecheck, frontend and API builds pass. The final banner-only refinement was followed by frontend typecheck/build and its relevant tests again.
- 123 related tests pass, including the new real grant/once-only boundary tests and prior balance suite; final focused rerun: 18 pass.
- Rosie: no award before 12 generations, Assemble awarded exactly once at 12; existing three legendary/champion plays → Mimic regression remains in the balance suite.
- Calavera: no award at 7 undead in graveyard, Ultimate Undead exactly once at 8; ability remains unchanged.
- Local mocked-API browser test `finisher-catalog-copy-browser.mjs`: 390px touch and 1440px desktop show both Rosie branches and Calavera's finisher reward, with no legacy upgrade/empty-condition copy or script errors. This is separate from live release-version verification.

No production champion data was changed by this fix. Release status must be confirmed by deployed API health and frontend version endpoints.

## All-champion follow-up

The owner requested checking every champion, not just Rosie/Calavera. Extended the captured public fixture and checks to all 11 champions and all 12 linked finisher cards. Every configured reward exists, catalog and normalized runtime links agree, and no linked reward uses legacy upgrade/zero-gold copy. The focused all-champion suite passes 17 tests. The mocked-API collection browser check passes all 11 champions at both 390px touch and 1440px desktop.

Render reports API and frontend release `ee324cc644526ccb915c2fb5cc2e1d821e3f183b` live. Public API health confirms that SHA. Public HTML serves `index-Dg-RnsSj.js` containing that SHA, collection/deck chunks use the new preparation copy, and `card-catalog-filters-D1hitGOP.js` contains both linked/branch reward text paths. However `/version.json` still returns the previous b105423 build with a CDN HIT header; the release helper's canonical frontend version check therefore did not pass. This is recorded separately from verification of the actual served page assets. Live-browser automation was attempted but blocked by the execution browser's certificate trust configuration; the desktop/touch browser passes above use local serving with captured public data. TLS verification was not disabled.

This follow-up adds verification only; it does not require another product deployment or modify saved champion definitions.
