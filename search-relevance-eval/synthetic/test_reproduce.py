import json
import hashlib
import io
import tarfile
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from synthetic import reproduce


class ReproductionTests(unittest.TestCase):
    def archive_fixture(self, root, member="auditoutputs/example.json"):
        data = b'{"verbatim": true}  \n'
        archive = root / "proof.tar.gz"
        with tarfile.open(archive, "w:gz") as stream:
            info = tarfile.TarInfo(member)
            info.size = len(data)
            stream.addfile(info, io.BytesIO(data))
        receipt = {"archive_path": archive.name,
                   "archive_sha256": hashlib.sha256(archive.read_bytes()).hexdigest(),
                   "members": [{"path": member, "bytes": len(data),
                                "sha256": hashlib.sha256(data).hexdigest()}]}
        (root / "review-source-archive.json").write_text(json.dumps(receipt))
        return data, archive

    def test_restore_preserves_verbatim_bytes_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            data, _ = self.archive_fixture(root)
            reproduce.restore_review_sources(root)
            target = root / "auditoutputs/example.json"
            self.assertEqual(target.read_bytes(), data)
            before = target.stat().st_mtime_ns
            reproduce.restore_review_sources(root)
            self.assertEqual(target.stat().st_mtime_ns, before)
            target.write_bytes(b"altered")
            with self.assertRaisesRegex(ValueError, "overwrite altered"):
                reproduce.restore_review_sources(root)
            self.assertEqual(target.read_bytes(), b"altered")

    def test_restore_rejects_archive_tamper_and_path_escape(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, archive = self.archive_fixture(root)
            archive.write_bytes(archive.read_bytes() + b"changed")
            with self.assertRaisesRegex(ValueError, "archive changed"):
                reproduce.restore_review_sources(root)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.archive_fixture(root, "../escape.json")
            with self.assertRaisesRegex(ValueError, "Unsafe"):
                reproduce.restore_review_sources(root)

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
