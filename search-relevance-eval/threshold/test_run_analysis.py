"""Only auxiliary transport handling, not a second scoring implementation."""
import copy
import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("tested_report_wrapper", Path(__file__).with_name("run_analysis.py"))
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)


class AuxiliaryMaskTests(unittest.TestCase):
    def fixture(self):
        mask = [dict(cohort="NEW", seed=1, query_id="q", dataset_id="d", allowed_grades=[2, 3])]
        return dict(uncertainty_pairs=mask, diagnostic_policy=dict(uncertainty_pairs=copy.deepcopy(mask),
            uncertainty_mask_sha256=w.analysis.digest(mask)), evidence={"argument_files": {"uncertainty_pairs": "bound-source"}},
            qrels=[dict(grade="U")])

    def test_remove_only_exact_duplicate_keep_original_evidence_and_U(self):
        original = self.fixture()
        before = copy.deepcopy(original)
        converted = w.report_arguments(original)
        self.assertNotIn("uncertainty_pairs", converted)
        self.assertEqual(before, original)
        self.assertIs(converted["evidence"], original["evidence"])
        self.assertEqual("bound-source", converted["evidence"]["argument_files"]["uncertainty_pairs"])
        self.assertEqual("U", converted["qrels"][0]["grade"])

    def test_different_mask_or_forged_sha_rejected_before_removal(self):
        original = self.fixture()
        original["uncertainty_pairs"][0]["allowed_grades"] = [0]
        with self.assertRaises(ValueError):
            w.report_arguments(original)
        self.assertIn("uncertainty_pairs", original)
        original = self.fixture()
        original["diagnostic_policy"]["uncertainty_mask_sha256"] = "a" * 64
        with self.assertRaises(ValueError):
            w.report_arguments(original)
        self.assertIn("uncertainty_pairs", original)


if __name__ == "__main__":
    unittest.main()
