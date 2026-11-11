# Narrow runtime source and notice qualification

This is an evidence check for PR3916, **not legal advice, a complete license audit, or permission to distribute**. An SBOM is not compliance. MPL/LGPL components already occur in the official npm baseline; their presence is not automatically a violation and does not automatically relicense MAGDA. The pruning/source-reference work changes neither dependency versions nor source pins.

[Source references](<./source-references.json>) are keyed by installed component version and OS/architecture. The initial observation is ARM64 `magda-agent-runtime:source-pinned-local`, image `sha256:df9b0bc33cfe6797927869f4d63598f9aff5c36126c9d318de2029cfc0a41df5`. It is not the release identity: collect and qualify the **actual final immutable image ID/digest**, even when its versions are unchanged. ARM64 and AMD64 are reviewed separately; other architectures fail. The AMD64 observation is `magda-agent-runtime:source-pinned-pruned-amd64`, image `sha256:648c7e0d64b888deecc21862b7e711166982fc89105fe35019cf3d7ac6c71f51`. AMD64 package versions, notices, and all 40 WASM source/receipt files were independently checked. Architecture-independent source/notice references use explicit manifest inheritance; x64 artifacts, paths and native hashes are separately recorded, never inherited from ARM binaries. Final collector ELF evidence is still required for each architecture.

## Use and collector contract

From the repository root:

```sh
node --test magda-agent-runtime/qualification/test-source-references.mjs
node magda-agent-runtime/qualification/verify-source-references.mjs \
  --evidence-dir /tmp/magda-pr3916-pruned-arm64-evidence \
  --component-version 'sharp=0.35.3' \
  --component-version '@deepseek-ai/libreoffice-kit-wasm=0.1.5' \
  --output /tmp/magda-pr3916-copyleft/source-reference-report.json
```

The [verifier](<./verify-source-references.mjs>) is offline and never invokes Docker, executes a native binary, builds an image, changes a lock, or downloads source. It consumes the final-artifact collector directory:

```text
image-metadata.json: {id:"sha256:…", architecture:"arm64", os:"linux", …}
inventory.json: {
  schemaVersion:1,
  nodePackages:[{name,version,path:"/…/package.json",license}],
  nativeBinaries:[{path,sha256,format:"ELF",machine:"AArch64",needed:[…]}],
  licenseFiles:[{path,sha256,bytes,archivePath}],
  sourceMetadata:[{packageName?,path,sha256,content?,archivePath?}], …
}
evidence/<absolute-image-path-with-leading-slash-removed>
licenses/MAGDA-Apache-2.0.txt
```

Copied notices/source receipts/recipes are rehashed; `archivePath` is relative to the bundle directory, defaults to `evidence/<image-relative-path>`, and must not escape it (including via symlinks). The collector must copy **all** WASM receipt `source.files`, its receipt, license files, the libvips README and versions descriptor. Native binary hashes and parsed ELF facts are collector claims bound to the immutable image; this verifier does not re-extract native binaries. The collector must compute these from that image, never a workspace installation.

Alternatively `--evidence FILE` takes `{image:{id,architecture,os},inventory:{…}}`, suitable for directly extracted Docker-image JSON and fixtures. It checks the supplied hashes/metadata, not archived bytes, and reports lower assurance. Parsed JSON `content` alone cannot prove original formatting/bytes; use directory mode for distribution evidence.

Installed versions drive lookup, not verifier constants or tags. Repeatable `--component-version NAME=VERSION` parameters are optional **assertions** against the final inventory, not version overrides. Unknown versions, hashes or architectures fail and require separate review; they never initiate dependency refresh. `--references FILE` supports a separately reviewed manifest. Tests cover missing/changed notices, stale source pins, wrong embedded versions, missing shared-linkage evidence, unknown versions/architectures, image identity, copied-byte tampering and archive traversal.

Exit status:

* `0`: technical evidence matches, **with explicitly unresolved obligations**; not a compliance pass.
* `1`: absent/mismatched evidence, unsupported version/architecture, or invalid input.
* `2`: only with `--require-resolved`, when technical checks pass but source/license/replacement gaps remain. The current baseline is expected to return `2` under that policy.

Retain the report, immutable image metadata, inventory, copied license/source evidence and source manifest together with the collector's checksum manifest/SBOM. CLI reports include `sourceReferencesSha256`, the SHA-256 of the exact reference-manifest bytes used, in addition to the final image identity. An OCI image ID and registry manifest digest are different identities: preserve whichever is actually reported, its platform, and the relationship established by the collector. Do not label a mutable tag a digest. Regenerate the final bundle's checksums after adding MAGDA's license and this report; do not silently invalidate an earlier checksum list or evidence archive. Publishing a checksum/SBOM does not publish corresponding source.

## LibreOffice Kit / WASM 0.1.5

Both packages declare MPL-2.0. Required shipped entry-package license and notice, WASM aggregate license, third-party notice and DeepSeek MIT notice have exact hashes in the manifest. WASM additionally ships an immutable core descriptor, aggregate source-change patch, individual patches, shim and build recipes. The verifier checks the shipped receipt and **every** listed source-file hash, not just that a descriptor exists. It also ties the actual inventoried 127,844,128-byte WASM binary hash to the pinned receipt (`c0a378364db66b97835fc56084146eb284f79a728aea9f6531b5ac9b24b8d46c`). Runtime loader/data assets are listed by the pinned receipt but are not independently rehashed by this narrow verifier; collector native inventory covers the WASM binary, not every runtime asset.

The shipped descriptor and receipt agree on [LibreOffice core `bce0998afefdbc355585ca324285661a2170ba77`](https://api.github.com/repos/LibreOffice/core/commits/bce0998afefdbc355585ca324285661a2170ba77), confirmed through GitHub API and [commit-addressed raw source](https://raw.githubusercontent.com/LibreOffice/core/bce0998afefdbc355585ca324285661a2170ba77/README.md). Its version is 26.8.0.3. The versioned Document Foundation archive recorded in the toolchain descriptor has no observed checksum; **do not silently substitute it for the exact core revision**.

The [public build recipe](https://raw.githubusercontent.com/deepseek-ai/dsh-libreoffice-kit/b19bb73c74ed893b8a5d1716d32df32a113ed31b/engine/wasm-source/build.mjs), [Node-runtime patch](https://raw.githubusercontent.com/deepseek-ai/dsh-libreoffice-kit/b19bb73c74ed893b8a5d1716d32df32a113ed31b/engine/wasm-source/patches/0003-node-runtime.patch) and [core checkout recipe](https://raw.githubusercontent.com/deepseek-ai/dsh-libreoffice-kit/b19bb73c74ed893b8a5d1716d32df32a113ed31b/scripts/core-checkout.mjs) were fetched at that immutable kit commit and matched the shipped files byte-for-byte. That is **not** proof this is the npm 0.1.5 release commit: npm exposes no `gitHead`, the repository exposes no release tags, and adapter source-to-published-JavaScript correspondence remains unresolved.

Recipient retrieval:

1. Obtain the exact WASM npm artifact from the manifest (or its full `sources/` and `licenses/` from the distributed image/bundle). Verify npm SHA-512 integrity before extracting, then verify receipt hashes. Retain notices unchanged. Artifact SHA-256 values are also recorded. The entry kit, Sharp and ARM64 libvips npm downloads passed registry SHA-512 integrity checks. The WASM npm artifact was independently downloaded, passed its registry SHA-512 integrity check, and **all 49 files** (including source receipts/patches, notices and runtime assets) matched the initially inspected image's SHA-256 values exactly. This proves public retrieval/correspondence of those shipped source materials, not an independent source rebuild. Final-image directory mode separately verifies source/notices and the WASM binary; it does not rehash every final-image loader/data asset.
2. Fetch the immutable core revision, for example in a new disposable directory:

   ```sh
   git init libreoffice-core
   git -C libreoffice-core remote add origin https://github.com/LibreOffice/core.git
   git -C libreoffice-core fetch --depth=1 origin bce0998afefdbc355585ca324285661a2170ba77
   git -C libreoffice-core checkout --detach FETCH_HEAD
   git -C libreoffice-core rev-parse HEAD
   # Check then apply the distributed sources/source-changes.patch to this checkout.
   # Or follow the shipped recipe's ordered individual patches + shim. Do not apply both.
   ```

3. Preserve the entire shipped source receipt/recipe tree. It records Emsdk `5eb0bde7585670252e8ba05e9d361627bffd08b5` / 4.0.10, build flags and source modifications. Inspect recipes before running them and prepare their documented toolchain and external source downloads in an isolated build environment. No LibreOffice rebuild was performed here.
4. The distributor must make the covered source and modifications genuinely available to recipients, explain how to obtain them, retain notices, and resolve external-component coverage. Merely linking a mutable repository or a generic LibreOffice home page is insufficient evidence. A hosted, retained, checksummed source bundle is stronger than relying on indefinite upstream availability. Full external-source completeness remains unresolved here.

## Sharp 0.35.3 / native libvips package 1.3.2

Sharp and its ARM64 addon ship the Apache-2.0 license (identical checked hash). The libvips package declares LGPL-3.0-or-later; this does not mean every embedded library has that original license. The package README lists multiple dependency terms, with LGPL use via “or later” clauses. Its [npm metadata](https://registry.npmjs.org/@img/sharp-libvips-linux-arm64/1.3.2) records `gitHead` **`4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6`**. GitHub's [annotated v1.3.2 tag object](https://api.github.com/repos/lovell/sharp-libvips/git/tags/3338b03c138b3e1328e0a20b6543b99ab4438d8f) resolves to the same commit (GitHub reports a valid signature; no independent signature trust validation here).

All 28 shipped versions match the [commit-pinned versions properties](https://raw.githubusercontent.com/lovell/sharp-libvips/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/versions.properties), including `heif=1.23.1`, `rsvg=2.62.90`, `vips=8.18.3`. The manifest includes verified tag-to-commit source baselines for those three libraries. Read the exact [POSIX build recipe](https://raw.githubusercontent.com/lovell/sharp-libvips/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/build/posix.sh), not a current-main recipe: it downloads dependencies and applies patches. A pristine libvips tag alone is not the modified bundled library's complete source. Recipe inputs include checksum-free versioned archives and a **mutable libultrahdr PR patch URL**, so the build is not proven immutable/reproducible just because the recipe has a Git SHA.

**Concrete gaps:** the downloaded npm tarball has six files and **no license/notice file**, not merely none through depth three. Its README is a dependency-license table/link list, not all required license texts/copyright notices. The [upstream notice summary](https://raw.githubusercontent.com/lovell/sharp-libvips/4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6/THIRD-PARTY-NOTICES.md) is also not a full dependency license/source bundle. The GitHub release's only asset, `npm-workspace.tar.xz`, has an API-provided SHA-256 recorded in the manifest but is a **binary npm workspace**, not a verified corresponding-source bundle. It was not downloaded here. Do not advertise it as complete source.

Before a release policy can consider these resolved, assemble/review the actual binary dependency license texts/notices, and retrieve/preserve the exact dependency sources, patches, generated/vendored inputs (including Rust dependencies) and build/install instructions matching the shipped library. Publish a recipient-accessible retained source mechanism with checksums. This work deliberately does not guess missing checksums, claim a generic source repository satisfies those obligations, or change packages to hide the gap.

### Actual shared-library boundary and replacement

The final-image collector must parse the ELF dynamic section (no execution) of:

```text
/usr/local/lib/magda-agent/dsh/node_modules/@img/sharp-linux-arm64/lib/sharp-linux-arm64-0.35.3.node
  DT_NEEDED: libvips-cpp.so.8.18.3
/usr/local/lib/magda-agent/dsh/node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.3
  actual ELF64 AArch64 shared object, SHA-256 56f7e7c98d134371c07990a318e41178cf0b6a956b8d5cd73779881c17deaaab
```

The addon hash is also pinned in the manifest. The independently observed AMD64 variants use `@img/sharp-linux-x64` and `@img/sharp-libvips-linux-x64`; addon SHA-256 `62ad8a4400d01452a37034e527b3f0849c4d685b33e8acde79abfbcc9fe5bc12`, library SHA-256 `0c1a1560417bbcdac38ce83151e52e56711deb70c5373053822c3301a19a4496`. Their required `DT_NEEDED` SONAME is the same, but ELF machine must be x86-64, not AArch64. The replacement template below is ARM64-specific; use x64 paths and a matching x86-64 ABI for AMD64. The runtime lacks `readelf`; a bounds-checked ELF parser over extracted bytes supplies `DT_NEEDED`/machine evidence without invoking `ldd` or executing an unknown binary. These facts show that **libvips is not statically incorporated into the whole application/addon**. They do not show every libvips dependency is independently shared: the libvips `.so` bundles dependencies, whose source/terms still matter. The installed Sharp loaders were inspected as text and simply require the platform addon; no signature or library-hash rejection was observed there. Qualification hashes are build/distribution evidence, **not runtime integrity enforcement**. This is not a security proof about all application code.

A recipient with an ABI-compatible ARM64/glibc replacement can use an ordinary derived image, without recompiling MAGDA. **Template only; no derived image was built or replacement smoke test run in this task.** With distributor approval, test using trusted locally built replacement bytes, the same exported ABI/SONAME and required dependencies:

```dockerfile
ARG BASE
FROM ${BASE}
USER root
COPY --chmod=0644 replacement/libvips-cpp.so.8.18.3 /usr/local/lib/magda-agent/dsh/node_modules/@img/sharp-libvips-linux-arm64/lib/libvips-cpp.so.8.18.3
USER 10001:10001
```

```sh
# Use the final immutable image ID/digest in BASE, not a mutable production tag.
docker build --build-arg BASE=sha256:<final-image-id> -t magda-libvips-replacement-fixture .
docker run --rm --network none --read-only --entrypoint node \
  magda-libvips-replacement-fixture -e '
  const sharp=require("/usr/local/lib/magda-agent/dsh/node_modules/sharp");
  sharp({create:{width:2,height:2,channels:3,background:"red"}})
    .png().toBuffer().then(b=>{if(!b.length)process.exit(1)})
    .catch(e=>{console.error(e);process.exit(1)});'
```

Then compare the derived image's library hash to the supplied replacement, rerun ELF/linkage collection and runtime tests, preserve the recipient's source/notices, and check ABI-related failures (C++ ABI, symbols, glibc, transitive dependencies, loader paths). The stock-reference hash check is expected to fail for an intentionally modified library; it is not a ban on recipient modifications. Use a separately documented derived fixture qualification, not a forged stock pass. Dynamic linkage and a suggested COPY path are not a legal guarantee of LGPL compliance. Distribution review must address applicable library replacement/relinking permissions, any reverse-engineering restrictions, and Installation Information where required.

## MAGDA's own license is separate

Copy the repository's [Apache-2.0 license](<../../LICENSE>) into the bundle at the manifest's `licenses/MAGDA-Apache-2.0.txt`, recording its origin/revision and checksum. This covers MAGDA-owned code only; keep all actual third-party license/notice copies and source instructions alongside it. Never label MAGDA's root license as “all third-party licenses”. Directory-mode verification checks this separate file when supplied and otherwise records the missing bundle item as unresolved. The parent integration owns creating/publishing the final bundle and refreshing its checksums; this narrow addition does not edit the image, Dockerfile, package metadata or CI.
