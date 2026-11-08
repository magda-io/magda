"""Offline driver wiring/adversarial tests; toy mocks are NOT scientific evidence."""
import contextlib
from copy import deepcopy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import types
import unittest
from unittest.mock import Mock, patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("threshold_reproduce_tested", HERE / "reproduce.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
# Exercise the existing extractor, not a test implementation of extraction.
legacy_source = r.load_locked(HERE, "../synthetic/reproduce.py")


def encoded(row):
    return (json.dumps(row, sort_keys=True, separators=(",", ":"), ensure_ascii=False) + "\n").encode()


def archive(root, entries):
    """Build small deterministic fixture members, including adversarial tar types."""
    path = root / "review-source-archive.tar.gz"
    refs = []
    with tarfile.open(path, "w:gz") as stream:
        for name, data, kind in entries:
            item = tarfile.TarInfo(name)
            item.type = kind
            item.size = len(data) if kind == tarfile.REGTYPE else 0
            if kind == tarfile.SYMTYPE:
                item.linkname = "outside"
            stream.addfile(item, io.BytesIO(data) if kind == tarfile.REGTYPE else None)
            refs.append({"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    receipt = {"archive_path": path.name, "archive_sha256": r.sha(path), "members": refs}
    (root / "review-source-archive.json").write_text(json.dumps(receipt))
    return receipt


class DriverTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve() / "threshold"
        self.root.mkdir()
        self.qrels = [{"grade": "U", "query_id": "q", "dataset_id": "toy"}]
        self.evidence = [{"observation_original_unchanged": "café; toy only"}]
        entries = [(".local/qrels.jsonl", encoded(self.qrels[0]), tarfile.REGTYPE),
                   (".local/evidence.jsonl", encoded(self.evidence[0]), tarfile.REGTYPE)]
        entries += [(f".local/sources/{index}.json", b"{}\n", tarfile.REGTYPE) for index in range(47)]
        self.entries = entries
        receipt = archive(self.root, entries)
        self.manifest = {
            "diagnostic_only": True, "forced_recommendation": "D", "promotion_allowed": False,
            "actual_text_validation_passed": False, "original_strict_conformance_failed": True,
            "actual_rows_programmatically_closed_all_sizes": 1, "total_query_record_seed_size_pairs": 1,
            "known_pair_count": 0, "scored_unknown_pair_count": 1, "intentional_ambiguity_pair_count": 0,
            "legacy_unknown_pairs_unchanged": 12,
            "source_expansion_manifest": {"path": ".local/expansion.json"},
            "source_diagnostic_stage_validation": {"path": "diagnostic-stage-one-validation.json"},
            "qrels": {**receipt["members"][0], "row_count": 1},
            "expanded_evidence": {**receipt["members"][1], "row_count": 1},
        }
        for name in ("qrels", "expanded_evidence"):
            self.manifest[name].pop("bytes")
        # Pin small dummy source files. The mocked pure C API below tests wiring,
        # while the actual complete-source invocation is documented separately.
        self.pins = {}
        for relative in r.LOCKED_SHA256:
            path = self.root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            if not path.exists():
                path.write_text("# toy locked source or receipt: " + relative)
        self.save_manifest()
        self.result = {"manifest": {k: deepcopy(v) for k, v in self.manifest.items()
                                    if k not in ("qrels", "expanded_evidence")},
                       "qrels": self.qrels, "evidence": self.evidence}
        self.repin()
        self.addCleanup(patch.stopall)
        patch.object(r, "LOCKED_SHA256", self.pins).start()
        self.freeze = types.SimpleNamespace(verify=Mock())
        self.legacy = types.SimpleNamespace(restore_review_sources=legacy_source.restore_review_sources,
                                            main=Mock(return_value=0))
        self.expansion = types.SimpleNamespace(validate_diagnostic_expansion=Mock(return_value=self.result))
        self.loader = patch.object(r, "load_locked", side_effect=lambda root, name: {
            "freeze.py": self.freeze, "../synthetic/reproduce.py": self.legacy,
            "diagnostic_expansion.py": self.expansion}[name]).start()

    def save_manifest(self):
        (self.root / "diagnostic-validation-manifest.json").write_text(json.dumps(self.manifest))

    def repin(self):
        for relative in r.LOCKED_SHA256:
            self.pins[relative] = r.sha(self.root / relative)

    def test_complete_validation_restores_49_and_is_idempotent(self):
        first = r.validate(self.root)
        restored = list((self.root / ".local").rglob("*"))
        self.assertEqual(sum(p.is_file() for p in restored), 49)
        before = {str(p): p.read_bytes() for p in restored if p.is_file()}
        self.assertEqual(r.validate(self.root), first)
        self.assertEqual(before, {str(p): p.read_bytes() for p in restored if p.is_file()})
        self.assertEqual(first["forced_recommendation"], "D")
        self.assertFalse(first["actual_text_validation_passed"])
        self.assertFalse(first["execution_authorized"])
        self.expansion.validate_diagnostic_expansion.assert_called_with(
            self.root, ".local/expansion.json", "diagnostic-stage-one-validation.json")
        self.legacy.main.assert_called_with(["--diagnostic-only", "--validate-only"])

    def test_each_locked_source_or_receipt_drift_fails_before_import(self):
        for relative in self.pins:
            path = self.root / relative
            original = path.read_bytes()
            with self.subTest(relative=relative):
                path.write_bytes(original + b"\nchanged")
                with self.assertRaisesRegex(ValueError, "Locked reproduction input changed"):
                    r.validate(self.root)
                self.loader.assert_not_called()
                path.write_bytes(original)

    def test_missing_stage_receipt_fails_before_import(self):
        (self.root / "diagnostic-stage-one-validation.json").unlink()
        with self.assertRaisesRegex(ValueError, "Missing locked reproduction input"):
            r.validate(self.root)
        self.loader.assert_not_called()

    def test_freeze_failure_prevents_restore_and_C(self):
        self.freeze.verify.side_effect = ValueError("frozen specification changed")
        with self.assertRaisesRegex(ValueError, "frozen specification"):
            r.validate(self.root)
        self.assertFalse((self.root / ".local").exists())
        self.expansion.validate_diagnostic_expansion.assert_not_called()

    def test_C_source_closure_errors_are_not_waived(self):
        for reason in ("Missing/escaping artifact: original core review", "Diagnostic stage does not reproduce exactly"):
            with self.subTest(reason=reason):
                self.expansion.validate_diagnostic_expansion.side_effect = ValueError(reason)
                with self.assertRaisesRegex(ValueError, reason):
                    r.validate(self.root)
                self.legacy.main.assert_not_called()

    def test_U_tampering_in_existing_source_never_overwrites(self):
        legacy_source.restore_review_sources(self.root)
        path = self.root / ".local/qrels.jsonl"
        path.write_bytes(encoded({**self.qrels[0], "grade": 0}))
        tampered = path.read_bytes()
        with self.assertRaisesRegex(ValueError, "Do not overwrite"):
            r.validate(self.root)
        self.assertEqual(path.read_bytes(), tampered)
        self.expansion.validate_diagnostic_expansion.assert_not_called()

    def test_U_tampering_cannot_hide_behind_rehashed_archive_receipt(self):
        # Even if transport pins are adjusted in this toy test, independently
        # derived C rows still retain U and must match the sidecar byte-for-byte.
        entries = list(self.entries)
        entries[0] = (entries[0][0], encoded({**self.qrels[0], "grade": 0}), tarfile.REGTYPE)
        archive(self.root, entries)
        self.repin()
        with self.assertRaisesRegex(ValueError, "sidecar bytes differ"):
            r.validate(self.root)
        self.legacy.main.assert_not_called()

    def test_entire_C_manifest_compared_not_selected_counts(self):
        self.result["manifest"]["unexpected_new_finding"] = True
        with self.assertRaisesRegex(ValueError, "complete diagnostic expansion manifest"):
            r.validate(self.root)
        self.legacy.main.assert_not_called()

    def test_legacy_failure_is_not_ignored(self):
        self.legacy.main.return_value = 1
        with self.assertRaisesRegex(ValueError, "legacy diagnostic validation failed"):
            r.validate(self.root)


class ExtractorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name).resolve()

    def test_traversal_member_rejected(self):
        archive(self.root, [("../escape", b"bad", tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, "Unsafe historical archive member"):
            legacy_source.restore_review_sources(self.root)

    def test_symlink_member_rejected(self):
        archive(self.root, [("link", b"", tarfile.SYMTYPE)])
        with self.assertRaisesRegex(ValueError, "Unsafe historical archive member"):
            legacy_source.restore_review_sources(self.root)

    def test_archive_SHA_and_member_SHA_are_both_required(self):
        receipt = archive(self.root, [("safe", b"source", tarfile.REGTYPE)])
        path = self.root / "review-source-archive.tar.gz"
        path.write_bytes(path.read_bytes() + b"changed")
        with self.assertRaisesRegex(ValueError, "archive changed"):
            legacy_source.restore_review_sources(self.root)
        receipt = archive(self.root, [("safe", b"source", tarfile.REGTYPE)])
        receipt["members"][0]["sha256"] = "0" * 64
        (self.root / "review-source-archive.json").write_text(json.dumps(receipt))
        with self.assertRaisesRegex(ValueError, "member bytes differ"):
            legacy_source.restore_review_sources(self.root)
        self.assertFalse((self.root / "safe").exists())

    def test_duplicate_archive_member_rejected(self):
        archive(self.root, [("same", b"one", tarfile.REGTYPE), ("same", b"two", tarfile.REGTYPE)])
        with self.assertRaisesRegex(ValueError, "member set differs"):
            legacy_source.restore_review_sources(self.root)


class SerializationAndCliTests(unittest.TestCase):
    def test_stream_rejects_extra_rows_and_bad_count_or_SHA(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            path = root / "rows.jsonl"
            row = {"grade": "U", "text": "café"}
            path.write_bytes(encoded(row))
            reference = {"path": path.name, "sha256": r.sha(path), "row_count": 1}
            self.assertEqual(r.compare_jsonl(root, [row], reference), reference)
            with self.assertRaisesRegex(ValueError, "count/SHA"):
                r.compare_jsonl(root, [row], {**reference, "row_count": 2})
            with self.assertRaisesRegex(ValueError, "count/SHA"):
                r.compare_jsonl(root, [row], {**reference, "sha256": "0" * 64})
            path.write_bytes(encoded(row) + b"\n")
            with self.assertRaisesRegex(ValueError, "Extra diagnostic sidecar bytes"):
                r.compare_jsonl(root, [row], reference)

    def test_both_explicit_flags_required_without_validation(self):
        with patch.object(r, "validate") as validate, contextlib.redirect_stderr(io.StringIO()):
            for argv in ([], ["--validate-only"], ["--diagnostic-only"], ["--compose"], ["--verify-execution"]):
                with self.subTest(argv=argv), self.assertRaises(SystemExit) as caught:
                    r.main(argv)
                self.assertEqual(caught.exception.code, 2)
            validate.assert_not_called()

    def test_explicit_flags_call_only_offline_API(self):
        with patch.object(r, "validate", return_value={"forced_recommendation": "D"}) as validate:
            with contextlib.redirect_stdout(io.StringIO()) as output:
                self.assertEqual(r.main(["--validate-only", "--diagnostic-only"]), 0)
            validate.assert_called_once_with()
            self.assertEqual(json.loads(output.getvalue()), {"forced_recommendation": "D"})

    def test_real_loader_rejects_drift_before_executing_source(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "code.py").write_text("raise AssertionError('must never execute drift')")
            with patch.object(r, "LOCKED_SHA256", {"code.py": "0" * 64}):
                with self.assertRaisesRegex(ValueError, "code changed"):
                    r.load_locked(root, "code.py")


if __name__ == "__main__":
    unittest.main()
