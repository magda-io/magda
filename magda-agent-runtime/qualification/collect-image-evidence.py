#!/usr/bin/env python3
"""Final-image qualification evidence (Python stdlib only; not legal sign-off).

Default mode runs INSIDE an image and streams a safe tar.gz to stdout. --root is
for offline fixtures, not a way to broaden the public-code allowlist. Host mode
--generate is normally invoked through generate-image-artifacts.sh.
"""
import argparse
import base64
import collections
import email.parser
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import platform
import re
import shutil
import stat
import struct
import subprocess
import sys
import tarfile
import tempfile
import urllib.request

SCHEMA = 1
SYFT_VERSION = "1.38.0"
# Verified against official immutable GitHub release API asset digest fields:
# https://api.github.com/repos/anchore/syft/releases/tags/v1.38.0
SYFT_HASHES = {
    "darwin_arm64": "e2a02cf6786e420d8fa7d7907dac86f59ecc011c014b08ef521e8ed4f4ed2cda",
    "darwin_amd64": "909fba8522094679d68111884e8ebca91a22078f20a0b102ea14abfed5f7a98c",
    "linux_amd64": "bc664debb00db1b9b4b9dae4ba1a29d99621e33b641b94b78b9048374b812a3d",
    "linux_arm64": "5e28d8e86592a0f269c3bab153de2901714382366ed783b26774a5146361e33a",
}
PUBLIC = ("usr/lib", "usr/local/lib", "usr/share", "usr/local/share", "usr/bin", "usr/sbin", "usr/local/bin", "usr/local/sbin", "opt", "lib", "lib64", "bin", "sbin")
MAX_TEXT = 4 * 1024 * 1024
MAX_METADATA = 32 * 1024 * 1024
SECRET = re.compile(r"(^\.|^(auth|credentials?|secrets?|tokens?|passwords?)\.(json|ya?ml|txt|ini|conf)$|\.(pem|key|p12|pfx)$)", re.I)
TEXT = re.compile(r"^(licen[sc]e|copying|copyright|notice|third[-_ ]?party|authors)([._-]|$)", re.I)
SOURCE = re.compile(r"(source|notice|licen[sc]e|provenance|attribution).*\.json$", re.I)
# Deliberately conservative recognition, NOT an SPDX validator / approval list.
KNOWN_LICENSES = set("MIT ISC Apache-2.0 BSD-2-Clause BSD-3-Clause BSD-4-Clause 0BSD CC0-1.0 Unlicense Python-2.0 MPL-2.0 LGPL-2.1-only LGPL-2.1-or-later LGPL-3.0-only LGPL-3.0-or-later GPL-2.0-only GPL-2.0-or-later GPL-3.0-only GPL-3.0-or-later AGPL-3.0-only AGPL-3.0-or-later Zlib BSL-1.0 BlueOak-1.0.0 CC-BY-4.0 CC-BY-3.0 OFL-1.1 Artistic-2.0".split())
LIMITATIONS = [
    "Evidence is not legal sign-off; license declarations and source references require review.",
    "Only public code/documentation roots are walked; no /data, /run, /proc, /sys, /dev, /home, /root or /etc; hidden/secret-named files and directory symlinks are skipped.",
    "Node inventory uses physically installed package-root manifests, never dependency lockfile entries; duplicates at different paths are retained.",
    "Python metadata and dpkg-owned Python files are included; metadata-free vendored modules may remain unidentified.",
    "ELF / node addons / WASM hashes and declared embedded versions do not resolve every statically linked, vendored or generated native component or its license.",
    "Syft scans the squashed final filesystem, not all layers; scanner package detection is complemented, not replaced, by inventory.json.",
    "Text copies are size bounded; omissions, unsafe links, unreadable files and parse errors appear in collectionIssues.",
]


def encoded(value):
    return (json.dumps(value, indent=2, sort_keys=True, ensure_ascii=True) + "\n").encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def safe_name(name):
    p = PurePosixPath(name)
    if not name or p.is_absolute() or any(x in ("", ".", "..") for x in name.split("/")) or "\\" in name or any(ord(c) < 32 for c in name):
        raise ValueError("unsafe archive path: " + repr(name))
    return p.as_posix()


def license_review(value):
    if not isinstance(value, str) or not value.strip() or value.upper() in ("UNKNOWN", "NOASSERTION", "NONE", "UNLICENSED"):
        return "missing-or-unknown-license"
    tokens = re.findall(r"[^\s()]+", value)
    if any(t not in KNOWN_LICENSES and t not in ("AND", "OR") for t in tokens):
        return "nonstandard-or-unrecognized-license-declaration"
    return None


def elf_details(path, head):
    """Read section tables and DT_NEEDED; no execution, external tools or binary copy."""
    if head[:4] != b"\x7fELF":
        return {"format": "WASM", "machine": "wasm32-or-wasm64", "needed": []}
    bits = head[4]
    endian = "<" if head[5] == 1 else ">"
    machine = struct.unpack(endian + "H", head[18:20])[0]
    result = {"format": "ELF", "machine": {62: "x86_64", 183: "aarch64", 40: "arm", 3: "i386", 243: "riscv"}.get(machine, str(machine)), "elfClass": 64 if bits == 2 else 32, "needed": []}
    with open(path, "rb") as f:
        fmt = endian + ("IIQQQQIIQQ" if bits == 2 else "IIIIIIIIII")
        shoff = struct.unpack(endian + ("Q" if bits == 2 else "I"), head[40:48] if bits == 2 else head[32:36])[0]
        entsize, count = struct.unpack(endian + "HH", head[58:62] if bits == 2 else head[46:50])
        if count > 8192 or entsize < struct.calcsize(fmt):
            raise ValueError("invalid ELF section table")
        sections = []
        size = os.fstat(f.fileno()).st_size
        for i in range(count):
            if shoff + i * entsize + struct.calcsize(fmt) > size:
                raise ValueError("ELF section outside file")
            f.seek(shoff + i * entsize)
            sections.append(struct.unpack(fmt, f.read(struct.calcsize(fmt))))
        for s in sections:
            if s[1] != 6:  # SHT_DYNAMIC
                continue
            strings = sections[s[6]]
            if strings[5] > MAX_METADATA or strings[4] + strings[5] > size or s[5] > MAX_METADATA or s[4] + s[5] > size:
                raise ValueError("ELF dynamic metadata exceeds bounds")
            f.seek(strings[4]); table = f.read(strings[5])
            f.seek(s[4]); dynamic = f.read(s[5])
            efmt = endian + ("qQ" if bits == 2 else "iI")
            step = struct.calcsize(efmt)
            for offset in range(0, len(dynamic) - step + 1, step):
                tag, value = struct.unpack(efmt, dynamic[offset:offset + step])
                if tag == 1 and value < len(table):
                    result["needed"].append(table[value:].split(b"\0", 1)[0].decode("utf-8", "replace"))
    return result


class Collector:
    def __init__(self, root="/"):
        self.root = Path(root).resolve()
        self.inventory = {"schemaVersion": SCHEMA, "nodePackages": [], "pythonPackages": [], "osPackages": [], "nativeBinaries": [], "embeddedComponents": [], "licenseFiles": [], "sourceMetadata": [], "licenseReview": [], "collectionIssues": [], "coverageLimitations": LIMITATIONS}
        self.copies = {}
        self.owners = {}
        self.package_dirs = {}

    def issue(self, path, reason):
        self.inventory["collectionIssues"].append({"path": str(path), "reason": str(reason)})

    def public(self, rel):
        return any(rel == p or rel.startswith(p + "/") for p in PUBLIC) and not any(SECRET.search(c) for c in rel.split("/"))

    def actual(self, rel):
        safe_name(rel)
        p = self.root / rel
        # Resolve image-absolute symlinks inside fixture root, never on the host.
        parts = list(PurePosixPath(rel).parts)
        resolved = []
        links = 0
        while parts:
            piece = parts.pop(0)
            if piece == "..":
                if not resolved: raise ValueError("escaping symlink")
                resolved.pop(); continue
            if piece in ("", "."): continue
            candidate = self.root.joinpath(*resolved, piece)
            if candidate.is_symlink():
                links += 1
                if links > 40: raise ValueError("symlink loop")
                target = os.readlink(candidate)
                if target.startswith("/"): resolved = []
                parts = list(PurePosixPath(target).parts)[1 if target.startswith("/") else 0:] + parts
            else:
                resolved.append(piece)
        normalized = "/".join(resolved)
        if not self.public(normalized): raise ValueError("symlink target outside public roots")
        return self.root.joinpath(*resolved)

    def read(self, rel, limit=MAX_TEXT):
        try:
            if not self.public(rel): raise ValueError("not public code/documentation")
            p = self.actual(rel)
            if not stat.S_ISREG(p.stat().st_mode): raise ValueError("not regular file")
            with open(p, "rb") as f: data = f.read(limit + 1)
            if len(data) > limit: raise ValueError("file exceeds %s-byte limit" % limit)
            return data
        except (OSError, ValueError) as e:
            self.issue(rel, e)
            return None

    def copy(self, rel, data=None):
        if data is None: data = self.read(rel)
        if data is None: return None
        name = safe_name("evidence/" + rel)
        self.copies[name] = data
        return {"path": "/" + rel, "archivePath": name, "sha256": sha(data), "bytes": len(data)}

    def dpkg(self):
        adm = self.root / "var/lib/dpkg"
        if not (adm / "status").exists():
            self.issue("/var/lib/dpkg/status", "dpkg database absent")
            return
        cmd = ["dpkg-query", "--admindir=" + str(adm), "-W", "-f=${Package}\t${Version}\t${Architecture}\t${source:Package}\t${source:Version}\t${db:Status-Status}\n"]
        try:
            result = subprocess.run(cmd, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            for line in result.stdout.splitlines():
                name, version, arch, source, source_version, status_ = line.split("\t")
                if status_ != "installed": continue
                self.inventory["osPackages"].append({"name": name, "version": version, "architecture": arch, "sourcePackage": source, "sourceVersion": source_version, "copyrightPath": "/usr/share/doc/" + name + "/copyright"})
            if result.stderr: self.issue("dpkg-query", result.stderr)
        except (OSError, ValueError, subprocess.CalledProcessError) as e:
            self.issue("dpkg-query", e)
        try:
            for p in sorted((adm / "info").glob("*.list")):
                if p.is_symlink() or p.stat().st_size > MAX_METADATA:
                    self.issue(str(p.relative_to(self.root)), "unsafe/oversized dpkg list"); continue
                owner = p.name[:-5]
                with open(p, encoding="utf-8", errors="replace") as f:
                    for line in f:
                        rel = line.strip().lstrip("/")
                        if self.public(rel): self.owners.setdefault(rel, []).append(owner)
        except OSError as e: self.issue("/var/lib/dpkg/info", e)
        for pkg in self.inventory["osPackages"]:
            rel = pkg["copyrightPath"].lstrip("/")
            if not (self.root / rel).exists(): self.issue(rel, "installed package copyright missing")

    def review(self, item, ecosystem):
        reason = license_review(item.get("license"))
        if reason:
            self.inventory["licenseReview"].append({"ecosystem": ecosystem, "name": item.get("name"), "version": item.get("version"), "path": item.get("path"), "license": item.get("license"), "reason": reason})

    def files(self):
        seen = set()
        for base in PUBLIC:
            start = self.root / base
            if not start.exists() or start.is_symlink(): continue
            def onerror(e): self.issue(getattr(e, "filename", base), e)
            for directory, dirs, files in os.walk(start, followlinks=False, onerror=onerror):
                dirs[:] = sorted(d for d in dirs if not SECRET.search(d) and not (Path(directory) / d).is_symlink())
                for filename in sorted(files):
                    rel = (Path(directory) / filename).relative_to(self.root).as_posix()
                    if rel in seen or not self.public(rel): continue
                    seen.add(rel)
                    yield rel

    def collect(self):
        self.dpkg()
        files = list(self.files())
        for rel in files:
            name = PurePosixPath(rel).name
            parent = PurePosixPath(rel).parent
            is_pkg = name == "package.json" and (parent.parent.name == "node_modules" or (parent.parent.name.startswith("@") and parent.parent.parent.name == "node_modules"))
            if is_pkg:
                data = self.read(rel)
                if data is None: continue
                try:
                    doc = json.loads(data)
                    if not doc.get("name") or not doc.get("version"): continue
                    item = {"name": doc["name"], "version": doc["version"], "path": "/" + rel, "license": doc.get("license", doc.get("licenses")), "repository": doc.get("repository"), "homepage": doc.get("homepage"), "manifestSha256": sha(data)}
                    self.inventory["nodePackages"].append(item)
                    self.package_dirs[str(parent)] = item
                    self.copy(rel, data)
                    self.review(item, "node")
                except (ValueError, TypeError, AttributeError) as e: self.issue(rel, e)
            if name in ("METADATA", "PKG-INFO") and (".dist-info/" in rel or ".egg-info" in rel):
                data = self.read(rel)
                if data is not None:
                    msg = email.parser.Parser().parsestr(data.decode("utf-8", "replace"))
                    item = {"name": msg.get("Name"), "version": msg.get("Version"), "license": msg.get("License-Expression") or msg.get("License"), "classifiers": msg.get_all("Classifier", []), "path": "/" + rel, "owner": self.owners.get(rel, [])}
                    self.inventory["pythonPackages"].append(item)
                    self.copy(rel, data); self.review(item, "python")
        python_owned = collections.defaultdict(list)
        for rel, owners in self.owners.items():
            if re.search(r"/(python\d[^/]*|dist-packages|site-packages)/", "/" + rel) and rel.endswith((".py", ".so")) and (self.root / rel).exists():
                for owner in owners: python_owned[owner].append("/" + rel)
        self.inventory["dpkgOwnedPythonModules"] = [{"owner": k, "paths": sorted(v)} for k, v in sorted(python_owned.items())]
        for rel in files:
            name = PurePosixPath(rel).name
            libvips_readme = name.lower() == "readme.md" and "@img/sharp-libvips" in rel
            if TEXT.match(name) or rel.startswith("usr/share/common-licenses/") or "/licenses/" in rel or libvips_readme:
                record = self.copy(rel)
                if record:
                    owner = self.node_owner(rel)
                    if owner: record["packageName"] = owner["name"]
                    if libvips_readme: record["evidenceKind"] = "notice-summary-not-full-license-text"
                    self.inventory["licenseFiles"].append(record)
            source_file = bool(re.search(r"/(sources|licenses)/", rel) or re.search(r"(source|build|recipe|patch).*(\.(sh|py|mjs|patch|diff)|Dockerfile)$", name, re.I))
            if SOURCE.search(name) or source_file or libvips_readme or name == "prebuilds.json" or (name == "versions.json" and "@img/sharp-libvips" in rel) or rel in ("usr/local/share/magda-agent/dsh-lock.json",):
                data = self.read(rel)
                if data is not None:
                    record = self.copy(rel, data)
                    owner = self.node_owner(rel)
                    if owner: record["packageName"] = owner["name"]
                    self.inventory["sourceMetadata"].append(record)
                    try:
                        content = json.loads(data) if name.endswith(".json") else None
                        if name.endswith(".json"): record["content"] = content
                        if name == "versions.json" and "@img/sharp-libvips" in rel and isinstance(content, dict):
                            for component, version in sorted(content.items()):
                                self.inventory["embeddedComponents"].append({"parentPackage": owner["name"] if owner else None, "name": component, "version": version, "sourcePath": "/" + rel, "license": None, "reviewRequired": True})
                    except (ValueError, TypeError) as e: self.issue(rel, e)
            try:
                p = self.actual(rel)
                if not stat.S_ISREG(p.stat().st_mode): continue
                with open(p, "rb") as f:
                    head = f.read(64)
                    if head[:4] not in (b"\x7fELF", b"\0asm"): continue
                    digest = hashlib.sha256(head)
                    for chunk in iter(lambda: f.read(1024 * 1024), b""): digest.update(chunk)
                item = {"path": "/" + rel, "sha256": digest.hexdigest(), "size": p.stat().st_size, "owner": self.owners.get(rel, [])}
                node = self.node_owner(rel)
                if node: item["nodePackage"] = {k: node[k] for k in ("name", "version", "path")}
                try: item.update(elf_details(p, head))
                except (ValueError, IndexError, struct.error, OSError) as e:
                    item.update({"format": "ELF", "machine": "unknown", "needed": []}); self.issue(rel, "ELF metadata: " + str(e))
                self.inventory["nativeBinaries"].append(item)
            except (OSError, ValueError) as e: self.issue(rel, e)
        for pkg in self.inventory["osPackages"]:
            pkg["licenseEvidence"] = [x["archivePath"] for x in self.inventory["licenseFiles"] if x["path"] == pkg["copyrightPath"]]
            self.inventory["licenseReview"].append({"ecosystem": "dpkg", "name": pkg["name"], "version": pkg["version"], "reason": "Debian copyright may contain multiple file-specific licenses; human review required", "evidence": pkg["licenseEvidence"]})
        for pkg in self.inventory["nodePackages"]:
            # License text owned by a nested dependency cannot establish its parent's license.
            pkg["licenseEvidence"] = [x["archivePath"] for x in self.inventory["licenseFiles"] if x.get("packageName") == pkg["name"] and self.node_owner(x["path"].lstrip("/")) is pkg]
            full_text = [x for x in self.inventory["licenseFiles"] if x["archivePath"] in pkg["licenseEvidence"] and x.get("evidenceKind") != "notice-summary-not-full-license-text"]
            if not full_text:
                self.inventory["licenseReview"].append({"ecosystem": "node", "name": pkg["name"], "version": pkg["version"], "path": pkg["path"], "license": pkg["license"], "reason": "no-bundled-license-text-identified", "evidence": pkg["licenseEvidence"]})
        for item in self.inventory["embeddedComponents"]:
            self.inventory["licenseReview"].append(dict(item, ecosystem="embedded", reason="embedded-component-license-unresolved"))
        self.inventory["summary"] = {k: len(v) for k, v in self.inventory.items() if isinstance(v, list)}
        self.copies["inventory.json"] = encoded(self.inventory)
        # The index describes every member except itself, avoiding recursive hash claims.
        index = [{"path": k, "sha256": sha(v), "bytes": len(v)} for k, v in sorted(self.copies.items())]
        self.copies["file-index.json"] = encoded(index)
        return self.inventory

    def node_owner(self, rel):
        p = PurePosixPath(rel).parent
        while str(p) != ".":
            if str(p) in self.package_dirs: return self.package_dirs[str(p)]
            p = p.parent
        return None

    def archive(self, output):
        with gzip.GzipFile(fileobj=output, mode="wb", mtime=0) as gz:
            with tarfile.open(fileobj=gz, mode="w|") as tar:
                for name, data in sorted(self.copies.items()):
                    info = tarfile.TarInfo(safe_name(name)); info.size = len(data); info.mode = 0o644
                    tar.addfile(info, io.BytesIO(data))


def unpack(archive, output):
    # No extractall: no links, absolute paths, traversal, overwrite or special files.
    with tarfile.open(archive, "r:gz") as tar:
        seen = set()
        for member in tar:
            name = safe_name(member.name)
            if not member.isfile() or member.size > MAX_METADATA or name in seen: raise ValueError("unsafe archive member: " + name)
            seen.add(name)
            path = output / name
            path.parent.mkdir(parents=True, exist_ok=True)
            if any(p.is_symlink() for p in [path] + list(path.parents)): raise ValueError("symlink in output path")
            with open(path, "xb") as f: shutil.copyfileobj(tar.extractfile(member), f)


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def install_syft(tmp):
    arch = {"aarch64": "arm64", "arm64": "arm64", "x86_64": "amd64", "AMD64": "amd64"}.get(platform.machine())
    target = platform.system().lower() + "_" + str(arch)
    expected = SYFT_HASHES.get(target)
    if not expected: raise ValueError("unsupported scanner host: " + target)
    asset = "syft_" + SYFT_VERSION + "_" + target + ".tar.gz"
    url = "https://github.com/anchore/syft/releases/download/v" + SYFT_VERSION + "/" + asset
    archive = tmp / asset
    urllib.request.urlretrieve(url, archive)
    actual = hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual != expected: raise ValueError("Syft download checksum mismatch")
    binary = tmp / "syft"
    with tarfile.open(archive, "r:gz") as tar:
        member = tar.getmember("syft")
        if not member.isfile(): raise ValueError("invalid Syft binary member")
        with open(binary, "xb") as f: shutil.copyfileobj(tar.extractfile(member), f)
    binary.chmod(0o700)
    return binary, {"version": SYFT_VERSION, "downloadUrl": url, "archiveSha256": actual, "binarySha256": sha(binary.read_bytes()), "checksumSource": "https://api.github.com/repos/anchore/syft/releases/tags/v1.38.0"}


def compare(baseline, current, scope="all"):
    excluded = {"@magda/dsh-agent-skill-tools", "@magda/dsh-client-managed-profile", "@magda/dsh-workflow-capture-guidance"}
    def packages(doc):
        if "nodePackages" in doc:
            rows = doc["nodePackages"]
            if scope == "dsh":
                rows = [p for p in rows if p.get("path", "").startswith("/usr/local/lib/magda-agent/dsh/node_modules/")]
        elif isinstance(doc.get("packages"), list) and "installed" in doc.get("scope", "").lower() and "manifests" in doc.get("scope", "").lower():
            # Accept the earlier physical npm-baseline capture, never a lockfile.
            rows = doc["packages"]
        else:
            raise ValueError("baseline must contain collected nodePackages or explicitly scoped actual installed package manifests")
        if scope == "dsh": rows = [p for p in rows if p["name"] not in excluded]
        return collections.Counter((p["name"], p["version"]) for p in rows)
    ac, bc = packages(baseline), packages(current)
    a, b = set(ac), set(bc)
    if not ac or not bc: raise ValueError("empty package comparison scope; choose matching physical DSH baseline inventory")
    return {"schemaVersion": SCHEMA, "comparison": "physically installed Node name/version sets AND instance counts; not lockfiles, not license equivalence", "scope": scope, "excludedMagdaExtensionPackages": sorted(excluded) if scope == "dsh" else [], "scopeDescription": "DSH isolated node_modules only, excluding three separately inventoried MAGDA extensions and global npm/mgd" if scope == "dsh" else "all installed Node package manifests", "baselinePackageInstances": sum(ac.values()), "currentPackageInstances": sum(bc.values()), "baselineUniqueNameVersions": len(a), "currentUniqueNameVersions": len(b), "added": [{"name": n, "version": v} for n, v in sorted(b - a)], "removed": [{"name": n, "version": v} for n, v in sorted(a - b)], "changedInstanceCounts": [{"name": n, "version": v, "baselineInstances": ac[n, v], "currentInstances": bc[n, v]} for n, v in sorted(a | b) if ac[n, v] != bc[n, v]]}


def file_sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()


def validate_scanner_identity(inspect, sbom):
    """Check filesystem identity without conflating index/config/manifest IDs.

    Syft 1.38 can leave its architecture/os summary empty for docker-archive;
    the decoded OCI config is authoritative in that case. Never return/log the
    config itself: it also contains environment values unrelated to evidence.
    """
    metadata = sbom.get("source", {}).get("metadata", {})
    expected_layers = inspect.get("RootFS", {}).get("Layers")
    actual_layers = [layer.get("digest") for layer in metadata.get("layers", [])]
    if not isinstance(expected_layers, list) or not expected_layers or actual_layers != expected_layers:
        raise ValueError("scanner layer diff-ID sequence does not match Docker inspect RootFS.Layers")
    try:
        config_bytes = base64.b64decode(metadata.get("config", ""), validate=True)
        config = json.loads(config_bytes)
    except (ValueError, TypeError) as e:
        raise ValueError("scanner image config cannot be decoded for identity validation") from e
    config_digest = "sha256:" + sha(config_bytes)
    if metadata.get("imageID") != config_digest:
        raise ValueError("scanner imageID does not match image config SHA256")
    if config.get("rootfs", {}).get("diff_ids") != expected_layers:
        raise ValueError("scanner config rootfs diff IDs do not match Docker inspect RootFS.Layers")
    for field, inspect_field in (("architecture", "Architecture"), ("os", "Os")):
        expected = inspect[inspect_field]
        if config.get(field) != expected or (metadata.get(field) and metadata[field] != expected):
            raise ValueError("scanner image config " + field + " does not match Docker inspect")
    manifest_digest = metadata.get("manifestDigest")
    if not isinstance(manifest_digest, str) or not re.fullmatch(r"sha256:[0-9a-f]{64}", manifest_digest):
        raise ValueError("scanner archive manifest digest missing or invalid")
    return {"imageID": config_digest, "manifestDigest": manifest_digest, "architecture": config["architecture"], "os": config["os"], "platformFieldsFrom": "decoded image config (validated against Docker inspect)", "rootfsDiffIdsMatch": True, "rootfsLayerCount": len(expected_layers)}


def generate(args):
    if not re.fullmatch(r"linux/(amd64|arm64)", args.platform or ""): raise ValueError("--platform must be linux/amd64 or linux/arm64")
    output = Path(args.output).resolve()
    if output.exists() and any(output.iterdir()): raise ValueError("--output must be empty (prevents stale/mixed image evidence)")
    output.mkdir(parents=True, exist_ok=True)
    # Resolve tag ONCE. Pull if absent; all subsequent operations use immutable ID.
    inspect = subprocess.run(["docker", "image", "inspect", args.image], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if inspect.returncode:
        run(["docker", "pull", "--platform", args.platform, args.image])
        inspect = run(["docker", "image", "inspect", args.image], stdout=subprocess.PIPE)
    doc = json.loads(inspect.stdout)[0]
    actual_platform = doc["Os"] + "/" + doc["Architecture"]
    if actual_platform != args.platform: raise ValueError("image platform mismatch: " + actual_platform)
    image_id = doc["Id"]
    if not re.fullmatch(r"sha256:[0-9a-f]{64}", image_id): raise ValueError("invalid immutable Docker image ID")
    metadata = {"schemaVersion": SCHEMA, "requestedImage": args.image, "id": image_id, "repoDigests": doc.get("RepoDigests", []), "architecture": doc["Architecture"], "os": doc["Os"], "platform": args.platform, "magdaRevision": args.magda_revision, "dshLabels": {k: v for k, v in doc.get("Config", {}).get("Labels", {}).items() if k.startswith("io.magda.dsh.")}, "dockerDescriptor": doc.get("Descriptor"), "rootfsDiffIds": doc.get("RootFS", {}).get("Layers", []), "binding": "The Docker inspect Id/Descriptor may identify an OCI index in the containerd store, not a config or platform manifest. Docker run/save use this immutable ID and the inspected platform. Syft imageID is the decoded image-config digest; its manifestDigest identifies the docker-save archive manifest, which can differ from the registry platform manifest. Ordered rootfs diff IDs and config OS/architecture are validated against Docker inspect. --scope squashed selects final-filesystem catalog coverage; it does not mutate or squash image layers."}
    (output / "image-metadata.json").write_bytes(encoded(metadata))
    script = Path(__file__).resolve()
    archive = output / "evidence.tar.gz"
    with open(script, "rb") as source, open(archive, "xb") as target:
        run(["docker", "run", "--rm", "-i", "--network", "none", "--read-only", "--cap-drop=ALL", "--security-opt=no-new-privileges", "--user", "0:0", "--workdir", "/", "--platform", args.platform, "--entrypoint", "python3", image_id, "-"], stdin=source, stdout=target)
    unpack(archive, output)
    inventory = json.loads((output / "inventory.json").read_text())
    with tempfile.TemporaryDirectory(prefix="magda-image-syft-", dir="/tmp") as temp:
        tmp = Path(temp)
        syft, tool = install_syft(tmp)
        (output / "syft-version.txt").write_bytes(run([str(syft), "version"], stdout=subprocess.PIPE).stdout)
        saved = tmp / "image.tar"
        run(["docker", "image", "save", "--output", str(saved), image_id])
        tool["dockerSaveArchiveSha256"] = file_sha(saved)
        tool["dockerSaveArchiveBytes"] = saved.stat().st_size
        # One catalog pass, three serializers. No Docker socket/container mounts.
        config = tmp / "syft.yaml"
        config.write_text("check-for-app-update: false\n")
        command = [str(syft), "scan", "docker-archive:" + str(saved), "--config", str(config), "--scope", "squashed", "--platform", args.platform, "--output", "syft-json=" + str(output / "sbom.syft.json"), "--output", "spdx-json=" + str(output / "sbom.spdx.json"), "--output", "cyclonedx-json=" + str(output / "sbom.cdx.json")]
        # Ignore ambient Syft config/env, never load host project configuration or
        # use remote package/license enrichment during the final-image catalog.
        env = {k: v for k, v in os.environ.items() if not k.startswith("SYFT_")}
        env.update(SYFT_CHECK_FOR_APP_UPDATE="false", SYFT_GOLANG_SEARCH_REMOTE_LICENSES="false", SYFT_JAVA_USE_NETWORK="false", SYFT_JAVASCRIPT_SEARCH_REMOTE_LICENSES="false", SYFT_PYTHON_SEARCH_REMOTE_LICENSES="false", SYFT_PYTHON_GUESS_UNPINNED_REQUIREMENTS="false")
        with open(output / "syft.log", "wb") as log: run(command, env=env, stdout=log, stderr=subprocess.STDOUT)
        sbom = json.loads((output / "sbom.syft.json").read_text())
        metadata["syftSource"] = validate_scanner_identity(doc, sbom)
        tool["imageIdentityValidation"] = metadata["syftSource"]
        (output / "image-metadata.json").write_bytes(encoded(metadata))
        tool.update({"imageId": image_id, "platform": args.platform, "scope": "squashed", "source": "docker image save " + image_id, "catalogPasses": 1, "packageCountsByType": dict(collections.Counter(p["type"] for p in sbom["artifacts"])), "collectorSha256": sha(script.read_bytes()), "scannerConfiguration": sbom.get("descriptor", {}).get("configuration"), "coverageLimitations": LIMITATIONS})
        (output / "tool-report.json").write_bytes(encoded(tool))
    if args.baseline_inventory:
        baseline_path = Path(args.baseline_inventory)
        baseline = json.loads(baseline_path.read_text())
        report = compare(baseline, inventory, args.comparison_scope)
        report["baselineInventorySha256"] = sha(baseline_path.read_bytes())
        (output / "npm-baseline-comparison.json").write_bytes(encoded(report))
    else:
        (output / "npm-baseline-comparison.json").write_bytes(encoded({"status": "not-provided", "requiredAction": "Run this tool on the official npm baseline image with the same platform, then supply its inventory.json with --baseline-inventory. No fresh npm resolution is substituted for actual image contents."}))
    # Separate convenient indexes; authoritative originals remain in inventory.
    for key, filename in (("licenseFiles", "license-text-inventory.json"), ("licenseReview", "license-review.json")):
        (output / filename).write_bytes(encoded(inventory[key]))
    (output / "coverage-limitations.txt").write_text("\n".join(LIMITATIONS) + "\n")
    files = sorted(p for p in output.rglob("*") if p.is_file())
    sums = []
    for p in files:
        with open(p, "rb") as f:
            h = hashlib.sha256()
            for chunk in iter(lambda: f.read(1024 * 1024), b""): h.update(chunk)
        sums.append(h.hexdigest() + "  " + p.relative_to(output).as_posix())
    manifest = {"schemaVersion": SCHEMA, "subject": {"imageId": image_id, "platform": args.platform, "repoDigests": metadata["repoDigests"]}, "files": [{"sha256": line[:64], "path": line[66:]} for line in sums], "note": "Digest-bound qualification evidence, not a signature or legal approval. This index excludes itself and SHA256SUMS to avoid recursive hashes."}
    manifest_bytes = encoded(manifest)
    (output / "artifact-manifest.json").write_bytes(manifest_bytes)
    sums.append(sha(manifest_bytes) + "  artifact-manifest.json")
    (output / "SHA256SUMS").write_text("\n".join(sums) + "\n")
    print(json.dumps({"output": str(output), "imageId": image_id, "platform": args.platform, "collectorCounts": inventory["summary"], "syftCounts": tool["packageCountsByType"]}, indent=2))


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--generate", action="store_true")
    p.add_argument("--root", default="/")
    p.add_argument("--output")
    p.add_argument("--image")
    p.add_argument("--platform")
    p.add_argument("--magda-revision")
    p.add_argument("--baseline-inventory", help="inventory.json from qualification of official npm baseline image, or earlier explicitly scoped physical npm package capture")
    p.add_argument("--comparison-scope", choices=("dsh", "all"), default="dsh", help="default: isolated DSH packages minus three MAGDA extensions; global npm/mgd remain in the full inventory")
    args = p.parse_args()
    if args.generate:
        if not args.image or not args.output: p.error("--generate requires --image, --platform and --output")
        generate(args)
    else:
        c = Collector(args.root); c.collect()
        if args.output:
            with open(args.output, "xb") as f: c.archive(f)
        else: c.archive(sys.stdout.buffer)


if __name__ == "__main__":
    main()
