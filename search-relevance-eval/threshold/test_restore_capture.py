"""Synthetic temporary XZ bundles only; never opens the real capture bundle."""
import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest import mock

import restore_capture as restore


class RestoreCaptureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="restore-capture-test-")
        # macOS /var is itself a symlink; use its real spelling because the
        # restorer deliberately refuses symlinks in ANY target-root ancestor.
        self.base = Path(self.temp.name).resolve()
        self.archive = self.base / "fake.tar.xz"
        self.manifest = self.base / "fake-manifest.json"
        self.root = self.base / "destination"
        self.files = {"search-relevance-eval/threshold/.local/raw.bin": b"raw\x00bytes",
                      "magda-indexer/src/frozen.scala": b"source bytes\n"}
        self.bundle()

    def tearDown(self):
        # Cleanup is limited to this known, uniquely prefixed temp context.
        assert self.base.name.startswith("restore-capture-test-")
        assert self.base.parent.resolve() == Path(tempfile.gettempdir()).resolve()
        self.temp.cleanup()

    def save(self):
        raw = json.dumps(self.data, sort_keys=True).encode()
        self.manifest.write_bytes(raw)
        self.pin = hashlib.sha256(raw).hexdigest()

    def bundle(self, entries=None):
        entries = entries if entries is not None else [(n, b, tarfile.REGTYPE) for n, b in self.files.items()]
        with tarfile.open(self.archive, "w:xz", preset=0) as archive:
            for name, body, kind in entries:
                member = tarfile.TarInfo(name)
                member.type = kind
                member.size = len(body) if kind == tarfile.REGTYPE else 0
                member.linkname = "elsewhere" if kind in (tarfile.SYMTYPE, tarfile.LNKTYPE) else ""
                archive.addfile(member, io.BytesIO(body) if kind == tarfile.REGTYPE else None)
        raw = self.archive.read_bytes()  # Tiny synthetic fixture only.
        self.data = dict(schema_version=1, archive_path="search-relevance-eval/threshold/.local/fake.tar.xz",
                         archive_sha256=hashlib.sha256(raw).hexdigest(), archive_bytes=len(raw),
                         raw_bytes=sum(map(len, self.files.values())), member_count=len(self.files),
                         members=[dict(path=n, bytes=len(b), sha256=hashlib.sha256(b).hexdigest())
                                  for n, b in self.files.items()])
        self.save()

    def run_bundle(self, write=False):
        return restore.verify_restore(self.manifest, self.archive, self.root, self.pin, restore=write)

    def rejected_without_writes(self):
        with self.assertRaises((ValueError, OSError, KeyError, TypeError, tarfile.TarError)):
            self.run_bundle(True)
        self.assertFalse(self.root.exists())

    def test_verify_only_default_does_not_create_root(self):
        result = self.run_bundle()
        self.assertEqual(result, dict(members_verified=2, bytes_verified=22, existing_identical=0,
                                     files_restored=0, no_backend_calls=True, promotion_allowed=False))
        self.assertFalse(self.root.exists())

    def test_restore_exact_bytes_and_idempotence(self):
        self.assertEqual(self.run_bundle(True)["files_restored"], 2)
        before = {n: (self.root / n).stat().st_mtime_ns for n in self.files}
        for name, body in self.files.items():
            self.assertEqual((self.root / name).read_bytes(), body)
        again = self.run_bundle(True)
        self.assertEqual((again["files_restored"], again["existing_identical"]), (0, 2))
        self.assertEqual(before, {n: (self.root / n).stat().st_mtime_ns for n in self.files})

    def test_manifest_pin_checked_before_json_or_paths(self):
        self.manifest.write_bytes(b"NOT JSON ../untrusted")
        with mock.patch.object(restore.json, "loads", side_effect=AssertionError("parsed untrusted manifest")):
            self.rejected_without_writes()

    def test_expected_sha_must_be_hex(self):
        self.pin = "z" * 64
        self.rejected_without_writes()

    def test_archive_hash_before_tar_parsing(self):
        self.archive.write_bytes(b"changed archive")
        with mock.patch.object(restore.tarfile, "open", side_effect=AssertionError("parsed untrusted archive")):
            self.rejected_without_writes()

    def test_archive_size_before_tar_parsing(self):
        self.data["archive_bytes"] += 1
        self.save()
        with mock.patch.object(restore.tarfile, "open", side_effect=AssertionError("parsed wrong size archive")):
            self.rejected_without_writes()

    def test_invalid_manifest_paths(self):
        for name in ("../escape", "/absolute", "a/../b", "./a", "a/./b", "a//b", "a/", "a\\b", "a\x00b", "C:/evil", "C:evil", "", "."):
            with self.subTest(name=name):
                self.data["members"][0]["path"] = name
                self.save()
                self.rejected_without_writes()

    def test_invalid_archive_path_metadata(self):
        self.data["archive_path"] = "../evil.tar.xz"
        self.save()
        self.rejected_without_writes()

    def test_duplicate_manifest_paths(self):
        self.data["members"][1]["path"] = self.data["members"][0]["path"]
        self.save()
        self.rejected_without_writes()

    def test_prefix_colliding_manifest_paths(self):
        self.data["members"][0]["path"] = "a"
        self.data["members"][1]["path"] = "a/b"
        self.save()
        self.rejected_without_writes()

    def test_schema_integer_fields_and_hash_types(self):
        original = copy.deepcopy(self.data)
        for field, invalid in (("schema_version", True), ("schema_version", 2), ("member_count", True),
                               ("member_count", -1), ("archive_bytes", True), ("raw_bytes", 1.5),
                               ("archive_sha256", "bad"), ("members", {})):
            with self.subTest(field=field, invalid=invalid):
                self.data = copy.deepcopy(original)
                self.data[field] = invalid
                self.save()
                self.rejected_without_writes()
        for field, invalid in (("bytes", True), ("bytes", -1), ("bytes", "9"), ("sha256", 7), ("sha256", "x" * 64)):
            with self.subTest(field=field, invalid=invalid):
                self.data = copy.deepcopy(original)
                self.data["members"][0][field] = invalid
                self.save()
                self.rejected_without_writes()

    def test_manifest_totals(self):
        for field in ("member_count", "raw_bytes"):
            with self.subTest(field=field):
                self.data[field] += 1
                self.save()
                self.rejected_without_writes()

    def test_missing_archive_member(self):
        name = next(iter(self.files))
        self.bundle([(name, self.files[name], tarfile.REGTYPE)])
        self.rejected_without_writes()

    def test_extra_archive_member(self):
        entries = [(n, b, tarfile.REGTYPE) for n, b in self.files.items()]
        self.bundle(entries + [("extra", b"extra", tarfile.REGTYPE)])
        self.rejected_without_writes()

    def test_duplicate_archive_member(self):
        entries = [(n, b, tarfile.REGTYPE) for n, b in self.files.items()]
        self.bundle(entries + [entries[0]])
        self.rejected_without_writes()

    def test_archive_traversal(self):
        self.bundle([("../escape", b"bad", tarfile.REGTYPE)])
        self.rejected_without_writes()

    def test_nonregular_members(self):
        for kind in (tarfile.DIRTYPE, tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE,
                     tarfile.BLKTYPE, tarfile.FIFOTYPE, tarfile.GNUTYPE_SPARSE):
            with self.subTest(kind=kind):
                entries = [(n, b, kind if i == 0 else tarfile.REGTYPE)
                           for i, (n, b) in enumerate(self.files.items())]
                self.bundle(entries)
                self.rejected_without_writes()

    def test_member_size(self):
        self.data["members"][0]["bytes"] += 1
        self.data["raw_bytes"] += 1
        self.save()
        self.rejected_without_writes()

    def test_late_member_hash_prevents_earlier_writes(self):
        self.data["members"][-1]["sha256"] = "0" * 64
        self.save()
        self.rejected_without_writes()

    def test_existing_identical_verify_and_restore(self):
        name, body = next(iter(self.files.items()))
        target = self.root / name
        target.parent.mkdir(parents=True)
        target.write_bytes(body)
        self.assertEqual(self.run_bundle()["existing_identical"], 1)
        self.assertFalse((self.root / list(self.files)[1]).exists())
        self.assertEqual(self.run_bundle(True)["files_restored"], 1)

    def test_existing_conflict_prevents_all_writes(self):
        name = list(self.files)[-1]
        target = self.root / name
        target.parent.mkdir(parents=True)
        target.write_bytes(b"preserve changed evidence")
        for write in (False, True):
            with self.assertRaises(ValueError):
                self.run_bundle(write)
        self.assertEqual(target.read_bytes(), b"preserve changed evidence")
        self.assertFalse((self.root / list(self.files)[0]).exists())

    def test_existing_nonregular_target_and_parent(self):
        name = list(self.files)[0]
        target = self.root / name
        target.mkdir(parents=True)
        with self.assertRaises((ValueError, OSError)):
            self.run_bundle(True)
        self.assertEqual(list(target.iterdir()), [])

    def test_root_parent_and_leaf_symlinks_refused(self):
        outside = self.base / "outside"
        outside.mkdir()
        self.root.symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.run_bundle(True)
        self.assertEqual(list(outside.iterdir()), [])
        # No unlink: use distinct controlled paths for each subsequent case.
        self.root = self.base / "safe-root"
        self.root.mkdir()
        (self.root / "search-relevance-eval").symlink_to(outside, target_is_directory=True)
        with self.assertRaises(OSError):
            self.run_bundle(True)
        self.root = self.base / "leaf-root"
        target = self.root / list(self.files)[0]
        target.parent.mkdir(parents=True)
        target.symlink_to(outside / "missing")
        with self.assertRaises(OSError):
            self.run_bundle(True)
        self.assertEqual(list(outside.iterdir()), [])

    def test_ancestor_of_target_root_symlink_refused(self):
        real = self.base / "real"
        real.mkdir()
        alias = self.base / "alias"
        alias.symlink_to(real, target_is_directory=True)
        self.root = alias / "new-root"
        with self.assertRaises(OSError):
            self.run_bundle(True)
        self.assertFalse((real / "new-root").exists())

    def test_archive_change_between_passes_refused(self):
        original = restore._walk
        def mutate(*args, **kwargs):
            result = original(*args, **kwargs)
            with self.archive.open("ab") as source:
                source.write(b"mutation")
            return result
        with mock.patch.object(restore, "_walk", side_effect=mutate):
            self.rejected_without_writes()

    def test_exclusive_creation_preserves_racing_file(self):
        original = restore._existing
        planted = False
        def race(root, name, expected):
            nonlocal planted
            result = original(root, name, expected)
            # First two checks are preflight; first restore check plants a race.
            if race.calls == len(self.files) and not planted:
                target = root / name
                target.parent.mkdir(parents=True)
                target.write_bytes(b"racing evidence")
                planted = True
            race.calls += 1
            return result
        race.calls = 0
        with mock.patch.object(restore, "_existing", side_effect=race):
            with self.assertRaises(FileExistsError):
                self.run_bundle(True)
        self.assertEqual((self.root / list(self.files)[0]).read_bytes(), b"racing evidence")

    def test_failed_restore_preserves_partial_evidence(self):
        original = restore._consume
        def corrupt(source, destination=None):
            if destination is not None:
                destination.write(b"partial evidence")
                raise OSError("simulated copy failure")
            return original(source)
        with mock.patch.object(restore, "_consume", side_effect=corrupt):
            with self.assertRaises(OSError):
                self.run_bundle(True)
        self.assertEqual((self.root / list(self.files)[0]).read_bytes(), b"partial evidence")

    def test_huge_logical_stream_uses_bounded_reads(self):
        # 1 GiB + 1 MiB logical stream, one reused buffer, mocked digest only:
        # no huge allocation or CPU-heavy GiB hashing in this tiny test suite.
        chunk = b"x" * restore.CHUNK
        class VirtualStream:
            remaining = 1025
            def read(self, size):
                self_test.assertGreater(size, 0)
                self_test.assertLessEqual(size, 1024 * 1024)
                if self.remaining:
                    self.remaining -= 1
                    return chunk
                return b""
        self_test = self
        digest = mock.Mock()
        digest.hexdigest.return_value = "f" * 64
        with mock.patch.object(restore.hashlib, "sha256", return_value=digest):
            size, sha = restore._consume(VirtualStream())
        self.assertEqual((size, sha), (1025 * restore.CHUNK, "f" * 64))
        self.assertEqual(digest.update.call_count, 1025)

    def test_real_multichunk_hash(self):
        body = b"abc" * (restore.CHUNK // 3 + 10)
        self.assertEqual(restore._consume(io.BytesIO(body)), (len(body), hashlib.sha256(body).hexdigest()))

    def test_cli_default_and_restore_json(self):
        args = ["--manifest", str(self.manifest), "--archive", str(self.archive),
                "--expected-manifest-sha256", self.pin, "--target-root", str(self.root)]
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            self.assertEqual(restore.main(args), 0)
        self.assertEqual(json.loads(output.getvalue())["files_restored"], 0)
        self.assertFalse(self.root.exists())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(restore.main(args + ["restore"]), 0)
        self.assertTrue(self.root.exists())


if __name__ == "__main__":
    unittest.main()
