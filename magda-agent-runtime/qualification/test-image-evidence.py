#!/usr/bin/env python3
"""Docker-free qualification tests: python3 qualification/test-image-evidence.py."""
import base64
import copy
import importlib.util
import io
import json
from pathlib import Path
import struct
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("evidence", Path(__file__).with_name("collect-image-evidence.py"))
evidence = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evidence)


class EvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def put(self, name, content):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content if isinstance(content, bytes) else content.encode())
        return p

    def collector(self):
        return evidence.Collector(self.root)

    def test_real_installed_manifests_not_lockfile_dependencies(self):
        self.put("usr/local/lib/node_modules/@magda/mgd/package.json", json.dumps({"name": "@magda/mgd", "version": "3", "license": "Apache-2.0"}))
        self.put("usr/local/lib/magda-agent/dsh/node_modules/demo/package.json", json.dumps({"name": "demo", "version": "1", "license": "SEE LICENSE IN LICENSE.txt"}))
        self.put("usr/local/lib/magda-agent/dsh/node_modules/demo/examples/package.json", json.dumps({"name": "example-not-installed", "version": "1"}))
        self.put("usr/local/lib/magda-agent/dsh/pnpm-lock.yaml", "dev-only-dependency: 1.0\n")
        self.put("data/node_modules/private/package.json", '{"name":"secret","version":"1"}')
        c = self.collector(); inv = c.collect()
        self.assertEqual({p["name"] for p in inv["nodePackages"]}, {"@magda/mgd", "demo"})
        self.assertEqual(inv["licenseReview"][0]["name"], "demo")
        self.assertEqual(inv["licenseReview"][0]["reason"], "nonstandard-or-unrecognized-license-declaration")

    def test_archive_safe_paths_and_bounded_text(self):
        self.put("usr/share/doc/demo/LICENSE", "license\n")
        self.put("usr/share/doc/demo/.credentials.json", "SECRET")
        self.put("home/user/LICENSE", "SECRET")
        self.put("usr/share/doc/demo/NOTICE.big", b"x" * (evidence.MAX_TEXT + 1))
        self.put("usr/share/doc/other/copyright", "shared copyright")
        (self.root / "usr/share/doc/demo/COPYING").symlink_to("/usr/share/doc/other/copyright")
        (self.root / "usr/share/doc/demo/LICENSE.bad").symlink_to("/home/user/LICENSE")
        (self.root / "usr/share/doc/demo/LICENSE.traversal").symlink_to("../../../../../outside")
        c = self.collector(); inv = c.collect()
        self.assertTrue(any("outside public" in x["reason"] for x in inv["collectionIssues"]))
        self.assertTrue(any("limit" in x["reason"] for x in inv["collectionIssues"]))
        self.assertIn("evidence/usr/share/doc/demo/COPYING", c.copies)
        buf = io.BytesIO(); c.archive(buf); buf.seek(0)
        with tarfile.open(fileobj=buf, mode="r:gz") as tar:
            for m in tar:
                self.assertTrue(m.isfile())
                self.assertEqual(evidence.safe_name(m.name), m.name)
                self.assertNotIn(b"SECRET", tar.extractfile(m).read())
        index = json.loads(c.copies["file-index.json"])
        for item in index:
            self.assertEqual(item["sha256"], evidence.sha(c.copies[item["path"]]))

    def test_source_metadata_embedded_components_wasm_python(self):
        base = "usr/local/lib/magda-agent/dsh/node_modules/"
        self.put(base + "@img/sharp-libvips-linux-arm64/package.json", '{"name":"@img/sharp-libvips-linux-arm64","version":"1.3.2","license":"LGPL-3.0-or-later"}')
        self.put(base + "@img/sharp-libvips-linux-arm64/versions.json", '{"vips":"8.18.0","zlib":"1.3"}')
        self.put(base + "lokit/package.json", '{"name":"lokit","version":"1"}')
        self.put(base + "lokit/sources/source-changes.patch", "diff --git a/foo b/foo\n")
        self.put(base + "lokit/scripts/build-wasm.sh", "#!/bin/sh\n")
        self.put(base + "lokit/notices.json", '{"source":"https://example.invalid/commit/abc"}')
        wasm = b"\0asm\x01\0\0\0"
        self.put(base + "lokit/module.wasm", wasm)
        self.put("usr/lib/python3/dist-packages/demo-1.dist-info/METADATA", "Name: demo\nVersion: 1\nLicense-Expression: MIT\n")
        c = self.collector(); inv = c.collect()
        self.assertEqual(len(inv["embeddedComponents"]), 2)
        self.assertEqual(inv["nativeBinaries"][0]["sha256"], evidence.sha(wasm))
        self.assertEqual(inv["nativeBinaries"][0]["nodePackage"]["name"], "lokit")
        self.assertEqual(inv["pythonPackages"][0]["name"], "demo")
        self.assertEqual(inv["sourceMetadata"][0]["content"]["vips"], "8.18.0")
        self.assertTrue(any(x["path"].endswith("source-changes.patch") for x in inv["sourceMetadata"]))
        self.assertTrue(any(x["path"].endswith("build-wasm.sh") for x in inv["sourceMetadata"]))

    def test_invalid_json_and_unreadable_files_reported(self):
        p = self.put("usr/local/lib/node_modules/demo/package.json", "broken JSON")
        c = self.collector(); inv = c.collect()
        self.assertTrue(inv["collectionIssues"])
        self.assertEqual(inv["nodePackages"], [])
        # Mock open rather than relying on UID-specific chmod behavior in CI.
        from unittest.mock import patch
        with patch("builtins.open", side_effect=PermissionError("unreadable")):
            self.assertIsNone(c.read(p.relative_to(self.root).as_posix()))
        self.assertIn("unreadable", c.inventory["collectionIssues"][-1]["reason"])

    def test_elf_needed_parser(self):
        # ELF64 minimal section table: null + dynstr + dynamic.
        header = bytearray(64); header[:6] = b"\x7fELF\x02\x01"
        struct.pack_into("<H", header, 18, 183)
        struct.pack_into("<Q", header, 40, 64)
        struct.pack_into("<HH", header, 58, 64, 3)
        strings = b"\0libvips.so.42\0libc.so.6\0"
        off = 64 + 3 * 64
        null = b"\0" * 64
        strsec = struct.pack("<IIQQQQIIQQ", 0, 3, 0, 0, off, len(strings), 0, 0, 0, 0)
        dynamic = struct.pack("<qQqQqQ", 1, 1, 1, 15, 0, 0)
        dynsec = struct.pack("<IIQQQQIIQQ", 0, 6, 0, 0, off + len(strings), len(dynamic), 1, 0, 0, 16)
        p = self.put("usr/lib/addon.node", bytes(header) + null + strsec + dynsec + strings + dynamic)
        result = evidence.elf_details(p, bytes(header))
        self.assertEqual(result["machine"], "aarch64")
        self.assertEqual(result["needed"], ["libvips.so.42", "libc.so.6"])

    def test_reject_unsafe_tar_members(self):
        for name in ("../escape", "/absolute", "evidence/../../escape", "a\\b", "a//b"):
            with self.assertRaises(ValueError): evidence.safe_name(name)
        archive = self.root / "bad.tar.gz"
        with tarfile.open(archive, "w:gz") as tar:
            m = tarfile.TarInfo("symlink"); m.type = tarfile.SYMTYPE; m.linkname = "/tmp/out"
            tar.addfile(m)
        with self.assertRaises(ValueError): evidence.unpack(archive, self.root / "out")

    def test_credential_named_code_not_confused_with_secret_data(self):
        base = "usr/local/lib/magda-agent/dsh/node_modules/"
        for name in ("dsh-credentials-local", "dsh-token-meter", "@aws-sdk/credential-provider-node"):
            self.put(base + name + "/package.json", json.dumps({"name": name, "version": "1", "license": "MIT"}))
            self.put(base + name + "/credentials.json", '{"password":"PRIVATE"}')
        inv = self.collector().collect()
        self.assertEqual(len(inv["nodePackages"]), 3)

    def test_notice_summary_is_not_full_license_text_and_prebuilds_retained(self):
        base = "usr/local/lib/magda-agent/dsh/node_modules/"
        self.put(base + "@img/sharp-libvips-linux-arm64/package.json", '{"name":"@img/sharp-libvips-linux-arm64","version":"1.3.2","license":"LGPL-3.0-or-later"}')
        self.put(base + "@img/sharp-libvips-linux-arm64/README.md", "| vips | LGPL | https://example.invalid |")
        self.put(base + "lokit/package.json", '{"name":"lokit","version":"1"}')
        self.put(base + "lokit/prebuilds.json", '{"source":{"files":["sources/build.mjs"]}}')
        self.put(base + "lokit/sources/build.mjs", "// build recipe")
        c = self.collector(); inv = c.collect()
        self.assertTrue(any(x["path"].endswith("/prebuilds.json") and "content" in x for x in inv["sourceMetadata"]))
        self.assertTrue(any(x.get("evidenceKind") == "notice-summary-not-full-license-text" for x in inv["licenseFiles"]))
        self.assertTrue(any(x["name"] == "@img/sharp-libvips-linux-arm64" and x["reason"] == "no-bundled-license-text-identified" for x in inv["licenseReview"]))

    def test_dsh_baseline_scope_excludes_global_packages_and_magda_extensions(self):
        baseline = {"scope": "Actual installed npm package manifests under project node_modules", "packages": [{"name": "foo", "version": "1", "path": "node_modules/foo"}]}
        current = {"nodePackages": [{"name": "foo", "version": "1", "path": "/usr/local/lib/magda-agent/dsh/node_modules/foo/package.json"}, {"name": "npm", "version": "10", "path": "/usr/local/lib/node_modules/npm/package.json"}, {"name": "@magda/dsh-agent-skill-tools", "version": "0", "path": "/usr/local/lib/magda-agent/dsh/node_modules/@magda/dsh-agent-skill-tools/package.json"}]}
        report = evidence.compare(baseline, current, "dsh")
        self.assertEqual(report["currentPackageInstances"], 1)
        self.assertEqual(report["added"], [])
        with self.assertRaises(ValueError): evidence.compare({"packages": []}, current, "dsh")

    def scanner_fixture(self, architecture="arm64", os_="linux", config_layers=None):
        layers = ["sha256:" + "a" * 64, "sha256:" + "b" * 64]
        inspect = {"Id": "sha256:" + "c" * 64, "Descriptor": {"mediaType": "application/vnd.oci.image.index.v1+json", "digest": "sha256:" + "c" * 64}, "Architecture": "arm64", "Os": "linux", "RootFS": {"Layers": layers}}
        config = evidence.encoded({"architecture": architecture, "os": os_, "rootfs": {"type": "layers", "diff_ids": config_layers if config_layers is not None else layers}, "config": {"Env": ["SECRET=never-return-this-config"]}})
        sbom = {"source": {"metadata": {"imageID": "sha256:" + evidence.sha(config), "manifestDigest": "sha256:" + "d" * 64, "config": base64.b64encode(config).decode(), "architecture": "", "os": "", "layers": [{"digest": d} for d in layers]}}}
        return inspect, sbom

    def test_identity_distinguishes_index_config_and_archive_manifest(self):
        inspect, sbom = self.scanner_fixture()
        result = evidence.validate_scanner_identity(inspect, sbom)
        self.assertTrue(result["rootfsDiffIdsMatch"])
        self.assertEqual(result["rootfsLayerCount"], 2)
        self.assertEqual(result["architecture"], "arm64")
        self.assertEqual(len({inspect["Id"], result["imageID"], result["manifestDigest"]}), 3)
        self.assertNotIn("never-return-this-config", json.dumps(result))

    def test_identity_rejects_layer_diff_digest_or_order_mismatch(self):
        inspect, sbom = self.scanner_fixture()
        changed = copy.deepcopy(sbom)
        changed["source"]["metadata"]["layers"][0]["digest"] = "sha256:" + "e" * 64
        with self.assertRaisesRegex(ValueError, "layer diff-ID sequence"):
            evidence.validate_scanner_identity(inspect, changed)
        changed = copy.deepcopy(sbom)
        changed["source"]["metadata"]["layers"].reverse()
        with self.assertRaisesRegex(ValueError, "layer diff-ID sequence"):
            evidence.validate_scanner_identity(inspect, changed)
        inspect, sbom = self.scanner_fixture(config_layers=["sha256:" + "e" * 64])
        with self.assertRaisesRegex(ValueError, "config rootfs diff IDs"):
            evidence.validate_scanner_identity(inspect, sbom)

    def test_identity_rejects_platform_or_config_hash_mismatch(self):
        for architecture, os_ in (("amd64", "linux"), ("arm64", "darwin")):
            inspect, sbom = self.scanner_fixture(architecture, os_)
            with self.assertRaisesRegex(ValueError, "does not match Docker inspect"):
                evidence.validate_scanner_identity(inspect, sbom)
        inspect, sbom = self.scanner_fixture()
        sbom["source"]["metadata"]["architecture"] = "amd64"
        with self.assertRaisesRegex(ValueError, "architecture does not match"):
            evidence.validate_scanner_identity(inspect, sbom)
        inspect, sbom = self.scanner_fixture()
        sbom["source"]["metadata"]["imageID"] = inspect["Id"]
        with self.assertRaisesRegex(ValueError, "image config SHA256"):
            evidence.validate_scanner_identity(inspect, sbom)

    def test_streaming_file_sha(self):
        p = self.put("archive.tar", b"x" * (1024 * 1024 + 7))
        self.assertEqual(evidence.file_sha(p), evidence.sha(p.read_bytes()))

    def test_baseline_comparison_keeps_actual_versions(self):
        a = {"nodePackages": [{"name": "foo", "version": "1"}]}
        b = {"nodePackages": [{"name": "foo", "version": "2"}, {"name": "bar", "version": "1"}]}
        result = evidence.compare(a, b)
        self.assertEqual(result["removed"], [{"name": "foo", "version": "1"}])
        self.assertEqual(len(result["added"]), 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
