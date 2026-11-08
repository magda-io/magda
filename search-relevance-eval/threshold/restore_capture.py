#!/usr/bin/env python3
"""Verify an externally hash-pinned raw capture bundle; restore only by opt-in."""
import argparse
import hashlib
import json
import lzma
import os
from pathlib import Path, PurePosixPath
import re
import stat
import tarfile

CHUNK = 1024 * 1024


def _require(ok, message):
    if not ok:
        raise ValueError(message)


def _sha(value):
    _require(isinstance(value, str) and re.fullmatch(r"[0-9a-fA-F]{64}", value), "Invalid SHA-256")
    return value.lower()


def _integer(value):
    _require(type(value) is int and value >= 0, "Invalid nonnegative integer")
    return value


def _path(value):
    _require(isinstance(value, str) and value and not any(c in value for c in "\\\0:"), "Unsafe path")
    path = PurePosixPath(value)
    _require(not path.is_absolute() and str(path) == value and all(p not in ("", ".", "..") for p in value.split("/")), "Noncanonical relative path")
    return value


def _consume(source, destination=None):
    digest, size = hashlib.sha256(), 0
    while True:
        chunk = source.read(CHUNK)
        if not chunk:
            return size, digest.hexdigest()
        digest.update(chunk)
        size += len(chunk)
        if destination is not None:
            destination.write(chunk)


def _manifest(path, expected_sha):
    expected_sha = _sha(expected_sha)
    # Only manifest bytes are buffered. Authenticate them before interpreting JSON.
    with open(path, "rb") as source:
        chunks = []
        while True:
            chunk = source.read(CHUNK)
            if not chunk:
                break
            chunks.append(chunk)
    raw = b"".join(chunks)
    _require(hashlib.sha256(raw).hexdigest() == expected_sha, "Manifest SHA-256 differs")
    data = json.loads(raw)
    _require(isinstance(data, dict) and type(data.get("schema_version")) is int and data["schema_version"] == 1, "Unsupported manifest schema")
    _path(data["archive_path"])
    data["archive_sha256"] = _sha(data["archive_sha256"])
    _integer(data["archive_bytes"])
    _integer(data["raw_bytes"])
    _integer(data["member_count"])
    _require(isinstance(data["members"], list), "Invalid members")
    members = {}
    for row in data["members"]:
        _require(isinstance(row, dict), "Invalid member record")
        name = _path(row["path"])
        _require(name not in members, "Duplicate manifest member")
        members[name] = (_integer(row["bytes"]), _sha(row["sha256"]))
    _require(len(members) == data["member_count"] and sum(row[0] for row in members.values()) == data["raw_bytes"], "Manifest totals differ")
    for name in members:
        _require(not any(str(parent) in members for parent in PurePosixPath(name).parents), "Conflicting member paths")
    return data, members


def _directory(path, create=False):
    """Walk from filesystem root using no-follow directory descriptors."""
    fd = os.open(path.anchor, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for part in path.parts[1:]:
            try:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    os.close(fd)
                    return None
                os.mkdir(part, mode=0o755, dir_fd=fd)
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _existing(root, name, expected):
    target = root / name
    parent = _directory(target.parent)
    if parent is None:
        return False
    try:
        try:
            fd = os.open(target.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        except FileNotFoundError:
            return False
        with os.fdopen(fd, "rb") as source:
            _require(stat.S_ISREG(os.fstat(source.fileno()).st_mode), "Existing target is not regular")
            _require(_consume(source) == expected, "Existing target differs: " + name)
        return True
    finally:
        os.close(parent)


def _walk(source, members, root=None):
    seen, size, restored, identical = set(), 0, 0, 0
    source.seek(0)
    # LZMAFile's bounded read interface avoids unbounded expansion of a whole
    # compressed block in tarfile's r|xz stream adapter. Iterate, never getmembers.
    with tarfile.open(fileobj=source, mode="r:xz") as archive:
        for member in archive:
            name = _path(member.name)
            _require(name in members and name not in seen, "Extra or duplicate archive member")
            _require(member.type in (tarfile.REGTYPE, tarfile.AREGTYPE) and member.sparse is None, "Nonregular archive member")
            _require(member.size == members[name][0], "Member size differs")
            seen.add(name)
            with archive.extractfile(member) as body:
                if root is None or _existing(root, name, members[name]):
                    actual = _consume(body)
                    identical += root is not None
                else:
                    # Rewalk every parent immediately before exclusive creation;
                    # dir_fd + O_NOFOLLOW also protect against symlink swaps.
                    target = root / name
                    parent = _directory(target.parent, create=True)
                    try:
                        def opener(path, flags):
                            return os.open(path, flags | os.O_NOFOLLOW, 0o600, dir_fd=parent)
                        with open(target.name, "xb", opener=opener) as destination:
                            actual = _consume(body, destination)
                        restored += 1
                    finally:
                        os.close(parent)
                _require(actual == members[name], "Member bytes/hash differ: " + name)
                size += actual[0]
    _require(seen == set(members), "Missing archive members")
    return len(seen), size, identical, restored


def _identity(source):
    info = os.fstat(source.fileno())
    _require(stat.S_ISREG(info.st_mode), "Archive is not a regular file")
    return info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns, info.st_ctime_ns


def _check_archive(source, data, identity):
    _require(_identity(source) == identity, "Archive stat changed")
    source.seek(0)
    _require(_consume(source) == (data["archive_bytes"], data["archive_sha256"]), "Archive size/SHA-256 differs")
    _require(_identity(source) == identity, "Archive changed while hashing")


def verify_restore(manifest, archive, target_root, expected_manifest_sha256, restore=False):
    """No backend calls or scientific validation; failures raise without cleanup.

    Explicit root may be a relocated workspace. POSIX no-follow/dir_fd support
    is required; unsupported systems fail closed rather than weakening checks.
    """
    data, members = _manifest(manifest, expected_manifest_sha256)
    root = Path(os.path.abspath(target_root))  # Do not resolve away symlinks.
    with open(archive, "rb") as source:
        identity = _identity(source)
        _check_archive(source, data, identity)  # Before ANY tar parsing.
        count, size, _, _ = _walk(source, members)
        identical = sum(_existing(root, name, expected) for name, expected in members.items())
        _check_archive(source, data, identity)  # Same open source, after full preflight.
        restored = 0
        if restore:
            count, size, identical, restored = _walk(source, members, root)
            _check_archive(source, data, identity)
    return dict(members_verified=count, bytes_verified=size, existing_identical=identical,
                files_restored=restored, no_backend_calls=True, promotion_allowed=False)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--expected-manifest-sha256", required=True)
    parser.add_argument("--archive", required=True, type=Path)
    parser.add_argument("--target-root", required=True, type=Path)
    parser.add_argument("action", choices=("verify-only", "restore"), nargs="?", default="verify-only")
    args = parser.parse_args(argv)
    try:
        result = verify_restore(args.manifest, args.archive, args.target_root,
                                args.expected_manifest_sha256, args.action == "restore")
    except (ValueError, OSError, KeyError, TypeError, tarfile.TarError, lzma.LZMAError, EOFError) as error:
        parser.exit(1, json.dumps({"error": str(error), "no_backend_calls": True, "promotion_allowed": False}) + "\n")
    print(json.dumps(result, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
