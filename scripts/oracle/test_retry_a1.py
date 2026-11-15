import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('retry_a1', Path(__file__).with_name('retry-a1.py'))
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)

INSTANCE = {'id': 'ocid1.instance.test', 'display-name': m.NAME, 'shape': m.SHAPE, 'lifecycle-state': 'RUNNING'}


class Tests(unittest.TestCase):
    def attempt(self, journal, **kw):
        return m.retry('compartment', 'subnet', [{'name': 'AD-1'}], 'image', 'PUBLIC-KEY', journal, **kw)

    def test_capacity_then_success(self):
        with tempfile.TemporaryDirectory() as d:
            journal = Path(d) / 'launch.json'
            def service(*args):
                if len(args) >= 3 and args[2] == 'list':
                    return []
                if not journal.exists() or service.calls == 0:
                    service.calls += 1
                    raise m.CommandError('ServiceError: Out of host capacity.')
                service.calls += 1
                return INSTANCE
            service.calls = 0
            with patch.object(m, 'cli', side_effect=service), patch.object(m, 'ATTEMPTS', 2):
                sleeps = []
                self.assertEqual(self.attempt(journal, sleep=sleeps.append), INSTANCE)
            self.assertEqual(service.calls, 2)
            self.assertEqual(sleeps, [600])
            self.assertEqual(json.loads(journal.read_text())['status'], 'created')

    def test_every_request_uses_fixed_approved_shape_and_resources(self):
        with tempfile.TemporaryDirectory() as d:
            calls = []
            def service(*args):
                calls.append(args)
                return [] if args[2] == 'list' else INSTANCE
            with patch.object(m, 'cli', side_effect=service):
                self.attempt(Path(d) / 'launch.json')
            launch = next(c for c in calls if c[2] == 'launch')
            self.assertEqual(launch[launch.index('--shape')+1], m.SHAPE)
            self.assertEqual(json.loads(launch[launch.index('--shape-config')+1]), {'ocpus': 2, 'memoryInGBs': 12})
            self.assertEqual(json.loads(launch[launch.index('--source-details')+1])['bootVolumeSizeInGBs'], 50)
            self.assertNotIn('--fault-domain', launch)
            self.assertNotIn('--create-vnic-details', launch)
            self.assertEqual(launch[launch.index('--subnet-id')+1], 'subnet')
            self.assertEqual(launch[launch.index('--assign-public-ip')+1], 'true')
            self.assertEqual(json.loads(launch[launch.index('--metadata')+1]), {'ssh_authorized_keys': 'PUBLIC-KEY'})

    def test_existing_instance_never_launches_another(self):
        with tempfile.TemporaryDirectory() as d, patch.object(m, 'cli', return_value=[INSTANCE]) as cli:
            self.assertEqual(self.attempt(Path(d) / 'launch.json'), INSTANCE)
            self.assertEqual(cli.call_count, 1)

    def test_unknown_launch_result_stops_and_restart_does_not_retry(self):
        with tempfile.TemporaryDirectory() as d:
            journal = Path(d) / 'launch.json'
            def service(*args):
                if args[2] == 'list': return []
                raise m.Stop('timeout')
            with patch.object(m, 'cli', side_effect=service):
                with self.assertRaises(m.Stop): self.attempt(journal)
            self.assertEqual(json.loads(journal.read_text())['status'], 'request-started')
            with patch.object(m, 'cli', return_value=[]) as cli:
                with self.assertRaises(m.Stop): self.attempt(journal)
                self.assertEqual(cli.call_count, 1)

    def test_non_capacity_errors_never_retry(self):
        for error in ['NotAuthorizedOrNotFound', 'TooManyRequests', 'LimitExceeded', 'InternalError without capacity detail']:
            with self.subTest(error=error), tempfile.TemporaryDirectory() as d:
                def service(*args):
                    if args[2] == 'list': return []
                    raise m.CommandError(error)
                with patch.object(m, 'cli', side_effect=service), patch.object(m.time, 'sleep') as sleep:
                    with self.assertRaises(m.Stop): self.attempt(Path(d) / 'launch.json')
                    sleep.assert_not_called()

    def test_capacity_attempt_count_is_bounded(self):
        with tempfile.TemporaryDirectory() as d:
            calls = []
            def service(*args):
                if args[2] == 'list': return []
                calls.append(args)
                raise m.CommandError('Out of capacity for shape')
            with patch.object(m, 'cli', side_effect=service), patch.object(m, 'ATTEMPTS', 3):
                sleeps = []
                self.assertIsNone(self.attempt(Path(d) / 'launch.json', sleep=sleeps.append))
                self.assertEqual(len(calls), 3)
                self.assertEqual(sleeps, [600, 600])

    def test_completed_request_with_temporarily_missing_listing_cannot_duplicate(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'launch.json'
            m.write_state(p, {'status': 'created'})
            with patch.object(m, 'cli', return_value=[]) as cli:
                with self.assertRaises(m.Stop): self.attempt(p)
                self.assertEqual(cli.call_count, 1)

    def test_duplicate_names_or_another_a1_stop(self):
        with self.assertRaises(m.Stop): m.find_existing([INSTANCE, INSTANCE])
        with self.assertRaises(m.Stop): m.find_existing([{**INSTANCE, 'display-name': 'other'}])
        with self.assertRaises(m.Stop): m.find_existing([{**INSTANCE, 'lifecycle-state': 'TERMINATING'}])

    def test_non_home_region_stops_before_resource_creation(self):
        with tempfile.TemporaryDirectory() as d, patch.object(m, 'cli', return_value=[{'region-name': m.REGION, 'is-home-region': False}]) as cli:
            with self.assertRaises(m.Stop): m.preflight('compartment', Path(d) / 'missing')
            self.assertEqual(cli.call_count, 1)

    def test_storage_guard_blocks_over_200_total(self):
        with patch.object(m, 'cli', side_effect=[[{'size-in-gbs': 151}], []]):
            with self.assertRaises(m.Stop): m.inspect_storage('c', [{'name': 'AD-1'}])
        with patch.object(m, 'cli', side_effect=[[{'size-in-gbs': 150}], []]):
            m.inspect_storage('c', [{'name': 'AD-1'}])

    def test_preflight_uses_public_subnet_and_matching_arm_platform_image(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'network.txt'
            p.write_text('Subnet ID: ocid1.subnet.test\n')
            answers = [
                [{'region-name': m.REGION, 'is-home-region': True}],
                {'compartment-id': 'c', 'prohibit-public-ip-on-vnic': False},
                [{'name': 'AD-1'}], [], [],
                [{'id': 'wrong-x86', 'lifecycle-state': 'AVAILABLE', 'display-name': 'Canonical-Ubuntu-24.04', 'time-created': '2026'},
                 {'id': 'arm', 'lifecycle-state': 'AVAILABLE', 'display-name': 'Canonical-Ubuntu-24.04-Minimal-aarch64', 'time-created': '2025'},
                 {'id': 'wrong-os', 'lifecycle-state': 'AVAILABLE', 'display-name': 'Canonical-Ubuntu-26.04-Minimal-aarch64', 'time-created': '2026'}]
            ]
            with patch.object(m, 'cli', side_effect=answers):
                self.assertEqual(m.preflight('c', p)[2], 'arm')

    def test_subprocess_timeout_is_not_marked_as_capacity(self):
        with patch.object(m.subprocess, 'run', side_effect=subprocess.TimeoutExpired('oci', 180)):
            with self.assertRaises(m.Stop) as error: m.cli('compute', 'instance', 'launch')
            self.assertNotIsInstance(error.exception, m.CommandError)

    def test_cli_accepts_successful_empty_list_output(self):
        with patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, '', '')):
            self.assertEqual(m.cli('compute', 'instance', 'list'), [])
            self.assertEqual(m.cli('bv', 'volume', 'list'), [])

    def test_empty_or_malformed_post_cannot_be_treated_as_success(self):
        for payload in ['', 'not json', '{}']:
            with self.subTest(payload=payload), patch.object(m.subprocess, 'run', return_value=subprocess.CompletedProcess([], 0, payload, '')):
                with self.assertRaises(m.Stop): m.cli('compute', 'instance', 'launch')

    def test_region_request_includes_required_tenancy(self):
        with patch.object(m, 'cli', return_value=[]) as cli, tempfile.TemporaryDirectory() as d:
            with self.assertRaises(m.Stop): m.preflight('tenancy-test', Path(d) / 'missing')
            cli.assert_called_once_with('iam', 'region-subscription', 'list', '--tenancy-id', 'tenancy-test', '--all')

    def test_unlimited_mode_retries_beyond_old_twelve_attempts_and_stops_once(self):
        with tempfile.TemporaryDirectory() as d:
            calls = []
            def service(*args):
                if args[2] == 'list': return []
                calls.append(args)
                if len(calls) <= 14: raise m.CommandError('Out of host capacity')
                return INSTANCE
            with patch.object(m, 'cli', side_effect=service):
                sleeps = []
                self.assertEqual(self.attempt(Path(d) / 'launch.json', sleep=sleeps.append, attempts=0), INSTANCE)
                self.assertEqual(len(calls), 15)
                self.assertEqual(sleeps, [600] * 14)

    def test_local_cli_rejection_is_recorded_as_definitively_unsent(self):
        with tempfile.TemporaryDirectory() as d:
            journal = Path(d) / 'launch.json'
            def service(*args):
                if args[2] == 'list': return []
                raise m.CommandError("Usage: oci compute instance launch [OPTIONS]\nError: No such option", 2)
            with patch.object(m, 'cli', side_effect=service):
                with self.assertRaises(m.CommandError): self.attempt(journal)
            self.assertEqual(json.loads(journal.read_text())['status'], 'cli-rejected')

    def test_recover_only_confirmed_legacy_usage_record_and_preserve_backup(self):
        with tempfile.TemporaryDirectory() as d:
            journal = Path(d) / 'launch.json'
            old = {'status': 'request-started', 'domain': 'AD-1'}
            m.write_state(journal, old)
            m.recover_confirmed_old_usage_error(journal, [{'name':'AD-1'}])
            self.assertEqual(json.loads(journal.with_name('launch-before-cli-fix.json').read_text()), old)
            self.assertEqual(json.loads(journal.read_text())['status'], 'cli-rejected')
            m.write_state(journal, old)
            with self.assertRaises(m.Stop): m.recover_confirmed_old_usage_error(journal, [{'name':'AD-1'}])

    def test_recovery_cannot_clear_new_ambiguous_request_or_success(self):
        for state in [
            {'status': 'request-started', 'domain':'AD-1', 'schema':2},
            {'status': 'created', 'instance-id':'x'},
            {'status': 'request-started', 'domain':'AD-other'}]:
            with self.subTest(state=state), tempfile.TemporaryDirectory() as d:
                p=Path(d)/'launch.json';m.write_state(p,state)
                with self.assertRaises(m.Stop): m.recover_confirmed_old_usage_error(p,[{'name':'AD-1'}])
                self.assertEqual(json.loads(p.read_text()),state)

    def test_installed_cli_help_checked_before_any_launch(self):
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],0,'--shape --create-vnic-details','')):
            with self.assertRaises(m.Stop): m.validate_launch_options()
        supported='--compartment-id --availability-domain --display-name --shape --shape-config --source-details --subnet-id --assign-public-ip --metadata'
        with patch.object(m.subprocess,'run',return_value=subprocess.CompletedProcess([],0,supported,'')):
            m.validate_launch_options()

    def test_storage_is_rechecked_before_every_launch(self):
        with tempfile.TemporaryDirectory() as d:
            with patch.object(m,'cli',return_value=[]), patch.object(m,'inspect_storage',side_effect=m.Stop('storage exhausted')):
                with self.assertRaises(m.Stop): self.attempt(Path(d)/'launch.json')
                self.assertFalse((Path(d)/'launch.json').exists())


if __name__ == '__main__':
    unittest.main()
