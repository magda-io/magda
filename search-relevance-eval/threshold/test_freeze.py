import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

SOURCE = Path(__file__).with_name("freeze.py")
spec = importlib.util.spec_from_file_location("threshold_registration", SOURCE)
freeze = importlib.util.module_from_spec(spec)
spec.loader.exec_module(freeze)


class RegistrationTests(unittest.TestCase):
    def prepare(self, root):
        shutil.copyfile(SOURCE, root / "freeze.py")
        for name in freeze.FILES:
            (root / name).write_text("registered architecture\n")
        review = {"status": "structural_pre_generation_passed", "actual_text_validation_passed": False,
                  "spec_sha256": {name: freeze.sha(root / name) for name in freeze.FILES}}
        (root / "pre-generation-review.json").write_text(json.dumps(review))

    def test_registration_is_immutable_and_hash_bound(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.prepare(root)
            result = freeze.create(root)
            self.assertEqual(result, freeze.verify(root))
            self.assertFalse(result["actual_text_validation_passed"])
            with self.assertRaisesRegex(ValueError, "overwrite"):
                freeze.create(root)
            (root / "query-spec.jsonl").write_text("altered")
            with self.assertRaisesRegex(ValueError, "architecture changed"):
                freeze.verify(root)

    def test_stale_preflight_and_existing_realization_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.prepare(root)
            (root / "decision-gates.json").write_text("changed after review")
            with self.assertRaisesRegex(ValueError, "differs from independent"):
                freeze.create(root)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.prepare(root)
            (root / ".local/corpora").mkdir(parents=True)
            with self.assertRaisesRegex(ValueError, "before registration"):
                freeze.create(root)

    def test_nonexistent_actual_text_pass_cannot_be_registered(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.prepare(root)
            p = root / "pre-generation-review.json"
            review = json.loads(p.read_text())
            review["actual_text_validation_passed"] = True
            p.write_text(json.dumps(review))
            with self.assertRaisesRegex(ValueError, "do not yet exist"):
                freeze.create(root)


if __name__ == "__main__":
    unittest.main()
