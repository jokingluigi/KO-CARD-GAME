"""Actual CLI parsing only: the generation flag exits before any authenticated API request."""
import contextlib
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('helper', Path(__file__).with_name('retry-a1.py'))
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)
CLI = os.environ.get('OCI_HELPER_TEST_CLI')


@unittest.skipUnless(CLI, 'Set OCI_HELPER_TEST_CLI to an installed OCI CLI for parser-only checks')
class ActualCliTests(unittest.TestCase):
    def test_installed_help_covers_all_used_flags(self):
        helper.validate_launch_options()

    def test_full_real_launch_arguments_parse_without_api_call(self):
        captured = []
        instance = {'id':'ocid1.instance.test','display-name':helper.NAME,'shape':helper.SHAPE,'lifecycle-state':'PROVISIONING'}
        def fake(*args):
            if args[2] == 'list': return []
            captured.append(args)
            return instance
        with tempfile.TemporaryDirectory() as folder, patch.object(helper, 'cli', side_effect=fake), contextlib.redirect_stdout(io.StringIO()):
            helper.retry('ocid1.tenancy.test','ocid1.subnet.test',[{'name':'AD-1'}],
                         'ocid1.image.test','PUBLIC-KEY',Path(folder)/'launch.json')
        self.assertEqual(len(captured),1)
        # This flag generates a JSON template and does not invoke LaunchInstance.
        result=subprocess.run([CLI,'--region',helper.REGION,'--output','json',*captured[0],
                               '--generate-full-command-json-input'],capture_output=True,text=True,timeout=60,
                              env={**os.environ,'PAGER':'cat'})
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIsInstance(json.loads(result.stdout),dict)
        self.assertNotIn('No such option',result.stderr)


if __name__ == '__main__':
    unittest.main()
