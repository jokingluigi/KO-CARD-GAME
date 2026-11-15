# Oracle A1 retry helper verification

- User target remains Singapore A1 Flex **2 OCPU / 12 GB**, 50 GB boot volume, existing public subnet.
- Unsupported generated SDK-style VNIC flag replaced with exposed CLI flags.
- 21 mocked tests passed for continuous/bounded retry, noncapacity stop, duplicate protection, legacy parse-failure recovery, preserved ambiguous journals, fixed shape, storage checks, ARM image selection and CLI help checks.
- 2 actual OCI CLI 3.96.2 tests passed: installed command help contains every flag; the helper's complete launch arguments are accepted by `--generate-full-command-json-input`. This generated a template and made **no authenticated launch request**.
- Original downloaded network file and Cloud Shell credentials are not available to this execution environment. No server allocation, Oracle capacity, game migration or zero-cost entitlement has been verified here.
- No changes to main, production, Render service settings, live game data, or Oracle billing.
- Continuous mode is a foreground process, not a hosted daemon. It cannot guarantee surviving Cloud Shell session/VM termination. No immediate-success or timing promise.
- Legacy recovery is permitted only because the user supplied a definite CLI usage rejection before API transmission; records with current schema or unknown outcomes remain blocked.
