import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('rebase_capture_config', Path(__file__).with_name('rebase_analysis_config.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class RebaseTests(unittest.TestCase):
    def test_only_paths_change_and_original_remains_unchanged(self):
        original = {'workspace': '/old/repo', 'output_dir': '/old/repo/old-out', 'source_refs': {'x': {'path': '/old/repo/data.jsonl', 'sha256': 'a' * 64}}, 'literal': '/old/repository/not-a-child'}
        result = module.rebase(original, '/new/repo', '/new/repo/new-out')
        self.assertEqual(result['source_refs']['x']['path'], '/new/repo/data.jsonl')
        self.assertEqual(result['source_refs']['x']['sha256'], 'a' * 64)
        self.assertEqual(result['literal'], original['literal'])
        self.assertEqual(original['workspace'], '/old/repo')

    def test_output_outside_workspace_rejected(self):
        with self.assertRaises(ValueError):
            module.rebase({'workspace': '/old/repo'}, '/new/repo', '/elsewhere')
