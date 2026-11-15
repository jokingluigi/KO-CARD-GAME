# Oracle A1 capacity retry helper

This prepares a separate test VM for the user-authorized KO CARD GAME migration. It never changes Render, production/main branches, game rules, production DB, billing settings, or account subscriptions.

## Behavior

Run `retry-a1.py` in the user's Oracle Cloud Shell after the already-completed network setup. The helper reads `~/ko-game-network-result.txt`, validates Singapore is the home region, validates a public root-compartment subnet, and selects an available Ubuntu 24.04 ARM image compatible with A1.

It requests only `VM.Standard.A1.Flex`, **2 OCPU / 12 GB**, a **50 GB boot volume**, and a public IPv4. It reuses the existing network. Only an explicit out-of-capacity response allows another attempt. By default twelve rounds run ten minutes apart; `--attempts 0` keeps retrying capacity failures until a launch is accepted, an existing VM is detected, the user interrupts, the session ends, or a noncapacity/uncertain error occurs. It never substitutes another shape or upgrades the account. A successful launch response can still be PROVISIONING; verify RUNNING separately before deployment.

Keep Cloud Shell open. This is not a persistent background service: closing/disconnecting Cloud Shell can stop execution. No guarantee of stock, free-VM availability, or faster production gameplay is made.

This script applies the configuration already selected as Always Free-eligible in the user's free-trial console. It **cannot verify account billing entitlements or guarantee future Always Free policies**. The 200 GB aggregate root-compartment volume guard is based on the historically published allowance; it is not a billing proof. The account must remain unupgraded, and per-resource eligibility must be checked before production migration. No Oracle VM has been created from this development environment.

## Duplicate protection / errors

- A non-blocking local flock prevents concurrent helper copies in the same Cloud Shell home.
- Existing nonterminated `ko-game-server` stops further creation; another A1 instance also blocks automatic creation pending quota review.
- A durable launch journal is written **before** POST. Timeout/interruption/unknown error leaves it unresolved; the next execution lists instances and stops if unresolved rather than repeating a possibly successful POST.
- Only a definitive capacity rejection or CLI-local usage rejection marks a launch definitively unsent/retryable. CLI-local errors stop the current run. Other failures preserve uncertainty. Permission, quota, rate-limit, JSON and authentication errors stop immediately.
- Other actors manually creating differently named instances concurrently are outside the local lock. Do not run the GUI Create button or a different helper while this runs.

## SSH access

A new owner key is generated in Cloud Shell at `~/.ko-oracle-a1/oracle-owner` (mode 0600) and retained there. Its private contents are never printed or uploaded. It is separate from keys downloaded for the abandoned GUI form.

`migration.pub` is a temporary **public** key for the assistant's explicitly authorized migration work. It is also registered so the user does not need to share their private key. Its private half remains outside this repository in the execution workspace; no private credentials are published. Remove the migration public key from server `authorized_keys` when migration work is finished, retaining the owner's key.

## Validation

`python3 -m unittest discover -s scripts/oracle -p 'test_*.py'`

Mocked tests cover fixed resource parameters, bounded capacity retries, existing instances, uncertain result/restart, noncapacity errors, home-region checks, volume guards and ARM image selection. They do not exercise an authenticated OCI launch, live inventory, actual billing, network reachability, or a physical-device game session.

## Cloud Shell compatibility correction

A first live user attempt stopped at JSON parsing. Successful empty list output now maps to an empty collection (never for launch/get). Region subscription queries now supply the required `--tenancy-id` flag verified against Oracle's generated CLI source: https://github.com/oracle/oci-cli/blob/master/services/identity/src/oci_cli_identity/generated/identity_cli.py . Stage labels identify which OCI call fails without dumping request metadata. Fifteen mocked tests pass; a live successful A1 launch is still unverified.

## Resumed automation correction (2026-11-15)

The user's real `--create-vnic-details` failure is fixed using the actual CLI's `--subnet-id` and `--assign-public-ip true` options. The helper checks **the installed CLI help before provisioning**, not only the generated API schema. Official extension source: https://github.com/oracle/oci-cli/blob/master/services/core/src/oci_cli_compute/compute_cli_extended.py .

After the specifically documented old usage error, run with `--recover-old-cli-error`. Only the legacy two-field journal and a matching AD are eligible; its contents are backed up once. A current-format uncertain request, completed launch, timeout, or another recovery cannot be cleared this way. Do NOT use that flag to bypass an unknown old request; here the user supplied the exact pre-API usage error. Listing still checks for existing A1 instances first.

Successful CLI-local parsing now has a durable `cli-rejected` marker. Actual request-started records carry schema 2 and remain fail-closed. Storage usage is rechecked before each launch. Keep GUI Apply and other launch scripts stopped while this helper runs; the local flock cannot lock other cloud actors.

### Running

`python3 -u ko-oracle-a1.py --attempts 0 --recover-old-cli-error`

This runs in the user's Cloud Shell account. It is not running on the assistant's machine and does not install a daemon, cron job, GitHub Action or persistent cloud service. Browser/session termination, service session limits, or authentication expiration can stop it. Leave Cloud Shell open; Ctrl+C stops. Never promise unattended operation when the Cloud Shell VM is reclaimed. Existing keys/network are reused. Resource eligibility/billing verification remains separate.

### Verification

Twenty-one mocked control-flow tests and two **actual OCI CLI 3.96.2** parser/help checks passed (23 total). The actual CLI was installed in an isolated temporary directory; `--generate-full-command-json-input` exits without launching anything and was used to validate the helper's full launch argument list. Actual API provisioning, inventory, card charges, account-specific free entitlements, and overnight persistence were NOT tested. Receipt: `docs/qa/20261115-oracle-retry/tests.log`.
