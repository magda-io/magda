#!/usr/bin/env python3
"""Docker/network-free orchestration tests: python3 qualification/test-published-image.py."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPT = Path(__file__).with_name("qualify-published-image.sh")
REPOSITORY = "registry.example.invalid:5050/team/agent-runtime"
TAG = "mutable-branch"
REVISION = "f" * 40
INDEX = "sha256:" + "a" * 64
DIGESTS = {"amd64": "sha256:" + "b" * 64, "arm64": "sha256:" + "c" * 64}

# Every executable touched by the orchestrator is local; unexpected Docker
# invocations fail rather than ever falling through to a real Docker daemon.
STUB = r'''
import hashlib,json,os,pathlib,sys
mode=sys.argv[1]
args=sys.argv[2:]
root=pathlib.Path(os.environ["MOCK_ROOT"])
with (root/"calls.jsonl").open("a") as stream:
    stream.write(json.dumps({"command":mode,"args":args})+"\n")
if mode=="docker":
    if args[:3]==["buildx","imagetools","inspect"]:
        if args[-2:]==["--format","{{json .Manifest}}"]:
            print((root/"descriptor.json").read_text())
        elif args[-1:]==["--raw"]:
            print((root/"index.json").read_text())
        else:
            raise SystemExit("unexpected inspect arguments")
    elif args[:1]==["run"]:
        platform=args[args.index("--platform")+1]
        if os.environ.get("MOCK_PREFLIGHT_FAIL")==platform:
            raise SystemExit(43)
    else:
        raise SystemExit("unexpected Docker command")
elif mode=="generate":
    values=dict(zip(args[::2],args[1::2]))
    output=pathlib.Path(values["--output"])
    if output.exists() and any(output.iterdir()):
        raise SystemExit("collector requires empty dedicated output")
    if os.environ.get("MOCK_WRAPPER_FAIL")==values["--platform"]:
        raise SystemExit(44)
    output.mkdir(parents=True,exist_ok=True)
    (output/"inventory.json").write_text(json.dumps(values))
    (output/"artifact-manifest.json").write_text(json.dumps({"subject": {
        "imageId": "sha256:"+"e"*64, "platform": values["--platform"]}, "files": []}))
    (output/"evidence").mkdir()
    (output/"evidence"/"LICENSE.txt").write_text("transitive license\n")
    data=(output/"inventory.json").read_bytes()
    (output/"SHA256SUMS").write_text(hashlib.sha256(data).hexdigest()+"  inventory.json\n")
elif mode=="node":
    directory=pathlib.Path(args[args.index("--evidence-dir")+1])
    if not (directory/"licenses"/"MAGDA-Apache-2.0.txt").is_file():
        raise SystemExit("MAGDA license must be present before source verification")
    if os.environ.get("MOCK_VERIFIER_FAIL"):
        raise SystemExit(45)
    pathlib.Path(args[args.index("--output")+1]).write_text('{"reviewRequired":true}\n')
else:
    raise SystemExit("unexpected stub mode")
'''


class PublishedImageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="published image tests ")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.here = self.root / "repo" / "magda-agent-runtime" / "qualification"
        self.here.mkdir(parents=True)
        shutil.copyfile(SCRIPT, self.here / SCRIPT.name)
        (self.here.parent.parent / "LICENSE").write_text("MAGDA Apache license\n")
        (self.here / "README.md").write_text("Qualification review guidance\n")
        (self.here / "source-references.json").write_text('{"sources":[]}\n')
        (self.here / "verify-source-references.mjs").write_text("// mocked by PATH node\n")
        stub = self.root / "stub.py"
        stub.write_text(STUB)
        bin_dir = self.root / "bin"
        bin_dir.mkdir()
        for command in ("docker", "node"):
            executable = bin_dir / command
            executable.write_text(
                "#!" + sys.executable + "\n"
                "import os,sys\n"
                "os.execv(sys.executable,[sys.executable,os.environ['MOCK_STUB'],"
                + repr(command) + "]+sys.argv[1:])\n"
            )
            executable.chmod(0o755)
        (self.here / "generate-image-artifacts.sh").write_text(
            '#!/bin/sh\nexec "$MOCK_PYTHON" "$MOCK_STUB" generate "$@"\n'
        )
        self.env = dict(os.environ, PATH=str(bin_dir) + os.pathsep + os.environ["PATH"],
                        MOCK_ROOT=str(self.root), MOCK_STUB=str(stub), MOCK_PYTHON=sys.executable)
        for name in ("MOCK_PREFLIGHT_FAIL", "MOCK_WRAPPER_FAIL", "MOCK_VERIFIER_FAIL"):
            self.env.pop(name, None)
        self.output = self.root / "artifacts" / "agent-runtime" / REVISION
        self.descriptor = {"digest": INDEX}
        self.index = {"schemaVersion": 2, "manifests": [
            {"digest": digest, "platform": {"os": "linux", "architecture": arch}}
            for arch, digest in DIGESTS.items()
        ]}

    def run_script(self, arguments=None):
        (self.root / "descriptor.json").write_text(json.dumps(self.descriptor))
        (self.root / "index.json").write_text(json.dumps(self.index))
        return subprocess.run(
            ["sh", str(self.here / SCRIPT.name)] + (arguments if arguments is not None else
                [REPOSITORY, TAG, REVISION, str(self.output)]),
            env=self.env, cwd=self.root, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.PIPE, timeout=20,
        )

    def calls(self, command=None):
        log = self.root / "calls.jsonl"
        entries = [json.loads(line) for line in log.read_text().splitlines()] if log.exists() else []
        return [entry for entry in entries if command is None or entry["command"] == command]

    def assert_no_collectors(self):
        self.assertEqual(self.calls("generate"), [])
        self.assertEqual(self.calls("node"), [])
        self.assertFalse(any(call["args"][:1] == ["run"] for call in self.calls("docker")))
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_pins_index_then_both_platforms_and_checksums_complete_bundle(self):
        # Real-world indexes may include attestations: ignore unknown platforms.
        self.index["manifests"].append({"digest": "sha256:" + "d" * 64,
                                        "platform": {"os": "unknown", "architecture": "unknown"}})
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        docker = self.calls("docker")
        self.assertEqual(docker[0]["args"], ["buildx", "imagetools", "inspect",
                         REPOSITORY + ":" + TAG, "--format", "{{json .Manifest}}"])
        self.assertEqual(docker[1]["args"], ["buildx", "imagetools", "inspect",
                         REPOSITORY + "@" + INDEX, "--raw"])
        self.assertEqual(len(docker), 4)
        generated = self.calls("generate")
        self.assertEqual(len(generated), 2)
        self.assertEqual(len(self.calls("node")), 2)
        for i, (arch, digest) in enumerate(DIGESTS.items()):
            destination = self.output / ("linux-" + arch)
            self.assertEqual(generated[i]["args"], ["--image", REPOSITORY + "@" + digest,
                             "--platform", "linux/" + arch, "--output", str(destination),
                             "--magda-revision", REVISION])
            preflight = docker[i + 2]["args"]
            self.assertEqual(preflight[preflight.index("--platform") + 1], "linux/" + arch)
            self.assertIn(REPOSITORY + "@" + digest, preflight)
            self.assertNotIn(REPOSITORY + ":" + TAG, preflight)
            self.assertEqual(self.calls("node")[i]["args"], [str(self.here / "verify-source-references.mjs"),
                             "--evidence-dir", str(destination), "--output",
                             str(destination / "source-reference-review.json")])
            self.assertEqual((destination / "licenses" / "MAGDA-Apache-2.0.txt").read_text(), "MAGDA Apache license\n")
            for filename in ("QUALIFICATION.md", "source-references.json", "SHA256SUMS"):
                self.assertTrue((destination / filename).is_file())
            manifest = json.loads((destination / "artifact-manifest.json").read_text())
            self.assertEqual(manifest["subject"], {"imageId": "sha256:" + "e" * 64,
                                                  "platform": "linux/" + arch})
            manifest_files = {row["path"]: row["sha256"] for row in manifest["files"]}
            self.assertIn("licenses/MAGDA-Apache-2.0.txt", manifest_files)
            self.assertIn("source-reference-review.json", manifest_files)
            expected_files = {p.relative_to(destination).as_posix() for p in destination.rglob("*")
                              if p.is_file() and p.name not in ("SHA256SUMS", "artifact-manifest.json")}
            self.assertEqual(set(manifest_files), expected_files)
            for name, digest in manifest_files.items():
                self.assertEqual(hashlib.sha256((destination / name).read_bytes()).hexdigest(), digest)
            sums = {}
            for line in (destination / "SHA256SUMS").read_text().splitlines():
                digest, name = line.split("  ", 1)
                sums[name] = digest
                self.assertEqual(hashlib.sha256((destination / name).read_bytes()).hexdigest(), digest)
            self.assertEqual(set(sums), expected_files | {"artifact-manifest.json"})
        self.assertEqual((self.output / "image-reference.txt").read_text(), REPOSITORY + "@" + INDEX + "\n")
        self.assertEqual((self.output / "platform-digests.tsv").read_text(),
                         "".join(arch + "\t" + digest + "\n" for arch, digest in DIGESTS.items()))
        checksums = {}
        for line in (self.output / "SHA256SUMS").read_text().splitlines():
            digest, name = line.split("  ", 1)
            checksums[name] = digest
            self.assertEqual(hashlib.sha256((self.output / name).read_bytes()).hexdigest(), digest)
        actual = {p.relative_to(self.output).as_posix() for p in self.output.rglob("*")
                  if p.is_file() and p != self.output / "SHA256SUMS"}
        self.assertEqual(set(checksums), actual)
        self.assertIn("linux-arm64/SHA256SUMS", checksums)
        self.assertIn("linux-amd64/source-reference-review.json", checksums)

    def test_invalid_index_digest_fails_before_raw_fetch(self):
        for digest in ("sha256:short", "sha256:" + "G" * 64, "latest", "sha512:" + "a" * 64):
            with self.subTest(digest=digest):
                log = self.root / "calls.jsonl"
                if log.exists():
                    log.unlink()
                self.descriptor["digest"] = digest
                result = self.run_script()
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("invalid runtime index digest", result.stderr)
                self.assertEqual(len(self.calls("docker")), 1)
                self.assert_no_collectors()

    def test_duplicate_platform_fails_before_collectors(self):
        self.index["manifests"].append(dict(self.index["manifests"][0]))
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exactly one linux/amd64", result.stderr)
        self.assert_no_collectors()

    def test_missing_platform_fails_before_collectors(self):
        self.index["manifests"].pop()
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("exactly one linux/arm64", result.stderr)
        self.assert_no_collectors()

    def test_wrong_os_fails_before_collectors(self):
        self.index["manifests"][1]["platform"]["os"] = "windows"
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assert_no_collectors()

    def test_invalid_platform_digest_fails_before_collectors(self):
        self.index["manifests"][1]["digest"] = "sha256:not-a-digest"
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("invalid platform digest", result.stderr)
        self.assert_no_collectors()

    def test_native_execution_preflight_failure_propagates(self):
        self.env["MOCK_PREFLIGHT_FAIL"] = "linux/amd64"
        result = self.run_script()
        self.assertEqual(result.returncode, 43, result.stderr)
        self.assertEqual(self.calls("generate"), [])
        self.assertEqual(self.calls("node"), [])
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_arm64_execution_failure_retains_only_completed_amd64(self):
        self.env["MOCK_PREFLIGHT_FAIL"] = "linux/arm64"
        result = self.run_script()
        self.assertEqual(result.returncode, 43, result.stderr)
        self.assertEqual(len(self.calls("generate")), 1)
        self.assertTrue((self.output / "linux-amd64" / "source-reference-review.json").is_file())
        self.assertFalse((self.output / "linux-arm64").exists())
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_wrapper_failure_propagates_without_verifier_or_next_architecture(self):
        self.env["MOCK_WRAPPER_FAIL"] = "linux/amd64"
        result = self.run_script()
        self.assertEqual(result.returncode, 44, result.stderr)
        self.assertEqual(len(self.calls("generate")), 1)
        self.assertEqual(self.calls("node"), [])
        self.assertEqual(len(self.calls("docker")), 3)
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_source_verifier_failure_propagates(self):
        self.env["MOCK_VERIFIER_FAIL"] = "1"
        result = self.run_script()
        self.assertEqual(result.returncode, 45, result.stderr)
        self.assertEqual(len(self.calls("generate")), 1)
        self.assertFalse((self.output / "SHA256SUMS").exists())

    def test_usage_error_does_not_invoke_docker(self):
        result = self.run_script([])
        self.assertEqual(result.returncode, 64)
        self.assertIn("usage:", result.stderr)
        self.assertEqual(self.calls(), [])


if __name__ == "__main__":
    unittest.main()
