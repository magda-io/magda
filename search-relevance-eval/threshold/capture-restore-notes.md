# Exact raw-capture verification and optional restoration

This is a byte verifier/restorer, **not** a scoring, replay, analysis or backend
execution framework. It never contacts a backend, changes labels/gates/configuration,
or authorizes promotion. Successful JSON always includes `no_backend_calls: true`
and `promotion_allowed: false`; it is not a scientific-validation pass.

The bundle is an exact **raw capture/source-input snapshot**, not a complete
application/repository backup or an archive of later analysis outputs. Use an
appropriate compatible code checkout for PR #3913. Workspace-relative member names
are preserved, including `.local` data and production source references outside the
threshold directory. No path remapping or absolute-reference regeneration occurs;
a separate analysis adapter must handle any such regeneration.

## Explicit inputs; read-only by default

Run from the workspace root, substituting an explicitly chosen canonical target
root with **no symlink in any ancestor**. On macOS that includes spelling temporary
locations using `/private/var/...` or `/private/tmp/...`, not their symlink aliases.
The archive may be stored elsewhere or renamed: `--archive` is the explicit source,
and the manifest's canonical `archive_path` is metadata, not a derived write path.

```sh
python3 -B search-relevance-eval/threshold/restore_capture.py \
  --manifest search-relevance-eval/threshold/capture-bundle-manifest.json \
  --expected-manifest-sha256 c34db9c9ac0bf50d3c4b516cf74f9fa732706b8c80f22e6833da0fc3542d3a43 \
  --archive search-relevance-eval/threshold/.local/frozen-execution-bundle.tar.xz \
  --target-root /absolute/canonical/compatible-checkout \
  verify-only
```

The displayed manifest pin was supplied with the completed capture by the parent
agent; this helper's synthetic test run did **not** independently inspect the actual
manifest/archive. Obtain the expected raw manifest SHA-256 independently from the
trusted delivery/commit, never by accepting a digest supplied alongside an untrusted
replacement manifest. The manifest bytes are authenticated before JSON/path use.
If delivery uses binary archive parts, first reconstruct the exact XZ byte sequence
in a new file; this helper neither joins parts nor trusts their individual hashes
as a substitute for the pinned manifest and full archive hash.

Omitting the final action means `verify-only`. It creates no files or directories,
verifies every regular-file header, exact member set, byte count and SHA-256, and
also checks existing destinations for conflicts. To opt into exclusive creation of
missing files/directories, use the same explicit arguments with final action
`restore`. Existing identical files are skipped; changed files, symlinks, special
files, and non-directory parents fail closed. There is no overwrite/force mode.

## Safety and resource behavior

- SHA-256 is streamed in 1 MiB reads; no archive/member `read_bytes`, `getmembers`,
  `extract`, `extractall`, broad copying, deletion, move, chown, timestamp replay or
  archive-permission application is used. Only authenticated manifest bytes are
  buffered. XZ's decoder dictionary uses additional bounded decoder memory.
- `tarfile.open(..., 'r:xz')` is iterated lazily and each extracted regular-file
  body is read in bounded chunks. The seekable XZ reader avoids the stream adapter's
  potentially large single-block decompression expansion.
- Before any tar parsing, the entire archive's size/hash must match. Before any
  destination writes, a full first pass validates all headers/bodies and a separate
  preflight checks **all** existing destinations. The same open archive descriptor
  is stat/hash-checked again before restoration and after it.
- All manifest/member paths must be unique canonical POSIX relative names: no
  absolute paths, empty/dot/parent components, backslash, NUL or drive syntax. Tar
  entries must exactly match the manifest; duplicates, extras, missing files,
  directories, links, devices, FIFOs and sparse extensions are refused. Integer
  fields reject booleans; declared member sizes and manifest totals must agree.
- Target directory walks use POSIX directory descriptors with `O_NOFOLLOW` for
  every ancestor, rewalked immediately before exclusive binary `xb` creation.
  Existing files are never overwritten. Unsupported platforms fail closed.
- A restore rehashes every copied member. Unexpected concurrent corruption or an
  I/O failure can leave a partial file; it is deliberately preserved as evidence,
  never removed or reported as valid. The operation is not a transactional rollback.
  Stop concurrent writers/renames while verifying/restoring trusted evidence.

API: `verify_restore(manifest, archive, target_root,
expected_manifest_sha256, restore=False)` returns `members_verified`,
`bytes_verified`, `existing_identical`, `files_restored`, `no_backend_calls`, and
`promotion_allowed`. Errors raise in the API; CLI errors emit JSON to stderr with
nonzero exit status, not success counts.

## Synthetic tests only

```sh
(cd search-relevance-eval/threshold && python3 -B -m unittest -q test_restore_capture)
```

The 30 tests use only tiny synthetic XZ tar files inside prefix-checked
`TemporaryDirectory` contexts. They cover pinning before parsing, unsafe/schema
paths, archive completeness/types/hash/size, late failures before writes, existing
conflicts/idempotence, no-write verification, symlinks, exclusive-creation races,
source mutation, preserved failed-copy evidence and bounded reads. A mocked digest
checks a virtual >1 GiB stream without allocating or hashing a GiB of test data.
No real capture body, native ranking output or source classification is read by
these tests. Parent-run actual bundle verification, if performed, must be reported
separately with its actual JSON result, not inferred from these synthetic tests.
