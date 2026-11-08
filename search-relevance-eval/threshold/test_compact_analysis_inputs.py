import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('compact_capture_manifest', Path(__file__).with_name('compact_analysis_inputs.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class CompactTests(unittest.TestCase):
    def test_evidence_is_exact_and_nested_decoy_ignored(self):
        expected = {'adapter_source_sha256': 'b' * 64, 'argument_files': {'x': {'path': 'a', 'sha256': 'a' * 64}}}
        with tempfile.TemporaryDirectory(prefix='compact-manifest-test-') as temp:
            source = Path(temp) / 'input.json'
            source.write_text(json.dumps({'before': {'evidence': 'decoy'}, 'evidence': expected, 'tail': [1, 2]}, indent=2))
            self.assertEqual(module.compact(source), {'evidence': expected})

    def test_missing_evidence_rejected(self):
        with tempfile.TemporaryDirectory(prefix='compact-manifest-test-') as temp:
            source = Path(temp) / 'input.json'
            source.write_text('{}')
            with self.assertRaises(ValueError):
                module.compact(source)
