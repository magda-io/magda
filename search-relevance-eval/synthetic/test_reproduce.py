import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from synthetic import reproduce


class ReproductionTests(unittest.TestCase):
    def test_dynamic_module_loading_restores_python_path(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "example.py"
            source.write_text("value = 42\n")
            before = list(sys.path)
            result = reproduce.load("offline_test_helper", source)
            self.assertEqual(result.value, 42)
            self.assertEqual(sys.path, before)

    def test_external_endpoints_rejected_without_subprocess(self):
        with patch.object(reproduce, "command") as command:
            with self.assertRaises(ValueError):
                reproduce.main(["--engine-url", "https://dev.magda.io/api", "--validate-only"])
            command.assert_not_called()

    def test_missing_independent_gate_cannot_start_services(self):
        with tempfile.TemporaryDirectory() as directory:
            with patch.object(reproduce, "ROOT", Path(directory)), patch.object(reproduce, "load") as load, patch.object(reproduce, "command") as command:
                execute = load.return_value
                execute.freeze_tool.verify.return_value = {"phase": "before_dataset_generation_and_search"}
                with self.assertRaisesRegex(ValueError, "Independent completed-study"):
                    reproduce.main(["--compose", "--allow-local-writes"])
                command.assert_not_called()


if __name__ == "__main__":
    unittest.main()
