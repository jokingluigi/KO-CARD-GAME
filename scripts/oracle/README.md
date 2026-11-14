# Oracle A1 capacity retry helper

This prepares a separate test VM for the user-authorized KO CARD GAME migration. It never changes Render, production/main branches, game rules, production DB, billing settings, or account subscriptions.

## Behavior

Run `retry-a1.py` in the user's Oracle Cloud Shell after the already-completed network setup. The helper reads `~/ko-game-network-result.txt`, validates Singapore is the home region, validates a public root-compartment subnet, and selects an available Ubuntu 24.04 ARM image compatible with A1.

It requests only `VM.Standard.A1.Flex`, **2 OCPU / 12 GB**, a **50 GB boot volume**, and a public IPv4. It reuses the existing network. Only an explicit out-of-capacity response allows another attempt. Twelve rounds run ten minutes apart (at most about two hours plus CLI runtime); it tries available domains, stops on success, and never substitutes another shape or upgrades the account.

Keep Cloud Shell open. This is not a persistent background service: closing/disconnecting Cloud Shell can stop execution. No guarantee of stock, free-VM availability, or faster production gameplay is made.

This script applies the configuration already selected as Always Free-eligible in the user's free-trial console. It **cannot verify account billing entitlements or guarantee future Always Free policies**. The 200 GB aggregate root-compartment volume guard is based on the historically published allowance; it is not a billing proof. The account must remain unupgraded, and per-resource eligibility must be checked before production migration. No Oracle VM has been created from this development environment.

## Duplicate protection / errors

- A non-blocking local flock prevents concurrent helper copies in the same Cloud Shell home.
- Existing nonterminated `ko-game-server` stops further creation; another A1 instance also blocks automatic creation pending quota review.
- A durable launch journal is written **before** POST. Timeout/interruption/unknown error leaves it unresolved; the next execution lists instances and stops if unresolved rather than repeating a possibly successful POST.
- Only a definitive capacity rejection resets eligibility to retry. Permission, quota, rate-limit, JSON and authentication errors stop immediately.
- Other actors manually creating differently named instances concurrently are outside the local lock. Do not run the GUI Create button or a different helper while this runs.

## SSH access

A new owner key is generated in Cloud Shell at `~/.ko-oracle-a1/oracle-owner` (mode 0600) and retained there. Its private contents are never printed or uploaded. It is separate from keys downloaded for the abandoned GUI form.

`migration.pub` is a temporary **public** key for the assistant's explicitly authorized migration work. It is also registered so the user does not need to share their private key. Its private half remains outside this repository in the execution workspace; no private credentials are published. Remove the migration public key from server `authorized_keys` when migration work is finished, retaining the owner's key.

## Validation

`python3 -m unittest discover -s scripts/oracle -p 'test_*.py'`

Mocked tests cover fixed resource parameters, bounded capacity retries, existing instances, uncertain result/restart, noncapacity errors, home-region checks, volume guards and ARM image selection. They do not exercise an authenticated OCI launch, live inventory, actual billing, network reachability, or a physical-device game session.

## Cloud Shell compatibility correction

A first live user attempt stopped at JSON parsing. Successful empty list output now maps to an empty collection (never for launch/get). Region subscription queries now supply the required `--tenancy-id` flag verified against Oracle's generated CLI source: https://github.com/oracle/oci-cli/blob/master/services/identity/src/oci_cli_identity/generated/identity_cli.py . Stage labels identify which OCI call fails without dumping request metadata. Fifteen mocked tests pass; a live successful A1 launch is still unverified.
