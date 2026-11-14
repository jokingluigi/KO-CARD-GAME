# Oracle migration paused — 2026-11-15 (Korea time)

User requested saving configuration and resuming later. Do not start retries, provision resources, upgrade billing, or migrate production until the user resumes.

## Verified from the user's console/output

- Oracle free-trial account; console banner says after trial the account is limited to Always Free resources. No paid upgrade authorized.
- Home region Singapore (`ap-singapore-1`); Seoul/Chuncheon listed as not subscribed, not a change of home region or proof of free compute eligibility there.
- User executed the network-creation block successfully (`NETWORK READY`). Existing VCN name prefix `ko-game-vcn-`, public regional subnet `ko-game-public`, CIDR `10.0.0.0/24`, internet gateway and default route created. Reuse these resources.
- Desired server: A1 Flex **2 OCPU / 12 GB**, Ubuntu 24.04 Minimal aarch64, public IPv4, default boot volume shown as 46.6 GB. User does not want automatic downsizing.
- GUI 2 OCPU/12 GB and 1 OCPU/6 GB attempts showed out-of-capacity in Singapore AD-1. Instance list subsequently empty in the selected root compartment.
- GUI review confirmed public IPv4 Yes. Later re-created form showed `No SSH access` warning: key setup must be completed before actual deployment. Do not assume the saved stack has the desired shape or SSH key; inspect it on resume.
- Boot-volume estimate showed $2.76/month. Actual Always Free entitlement/application was NOT independently verified. Do not guarantee 0 future cost from the free-trial account banner or nominal hardware alone.
- Saving confirmed in the final user screenshot: Resource Manager → Stacks lists `ko-game-server-setup` with status Active, created 2026-11-15 01:41:02 Korea time (2026-11-14 16:41:02 UTC). The preceding review showed Run apply unchecked. Active refers to the stack definition, not a running VM. Do NOT run Apply or auto-apply until the user resumes. No successful VM creation is confirmed.

## Cloud Shell helper: known incomplete implementation

Feature branch contains published helper at `a613952182baaea951d063b85dc02d4bf7d93836` (`scripts/oracle/retry-a1.py`). User explicitly gave up Cloud Shell after errors; do not ask them to rerun it on resume by default.

- Original empty collection parsing and missing required `--tenancy-id` fixed; 15 mocked tests passed, but no successful live launch was verified.
- Latest actual user error: `No such option '--create-vnic-details'`.
- Oracle's compute CLI extension removes/replaces that generated SDK-style option. Official source confirms launch flags `--subnet-id` and `--assign-public-ip`: https://github.com/oracle/oci-cli/blob/master/services/core/src/oci_cli_compute/compute_cli_extended.py . The fix has NOT been applied or published.
- Launch journal was written `request-started` before CLI option rejection. A future repair must retain uncertainty protection while allowing recovery only after verifying no existing instance and recognizing this documented pre-request validation failure. Do not blindly clear ambiguous launch records.
- Cloud Shell owner key exists per actual output at `~/.ko-oracle-a1/oracle-owner`; never request its private contents in chat. A temporary migration public key was included in script metadata; private half is outside git at `/workspace/cloud-setup/sshkeys/ko-oracle-migration`. No successful launch/SSH authorization has been confirmed. Remove temporary access after migration when applicable.

## Production state

No production server/DB migration or paid-plan upgrade performed. Render remains serving the existing game. Feature-only helper commits were pushed; main/production branches were not changed by the Oracle helper work. Keep existing Render available for comparison and rollback.

## Resume

1. Resource Manager → Stacks in Singapore; look for `ko-game-server-setup` (or default instance-named stack if the user retained it).
2. Inspect saved Terraform variables/configuration: exact shape/image/public subnet/public IPv4/SSH key/default disk. A later form may differ from the desired A1 settings.
3. Resolve Always Free entitlement and capacity before recommending production migration. Never equate trial credits with permanent free hosting.
4. If a VM can be provisioned, first use a separate test address and compare real multiplayer behavior against Render with the existing Singapore Supabase DB. No performance speedup has been established for Oracle.
