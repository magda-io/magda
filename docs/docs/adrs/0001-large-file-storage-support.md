# ADR 0001: Large file upload/download support for magda-storage-api

- **Status:** Accepted
- **Date:** 2026-07-04
- **Component:** `magda-storage-api` (+ its Helm chart)
- **Related:** epic [#3672](https://github.com/magda-io/magda/issues/3672) and sub-issues [#3673](https://github.com/magda-io/magda/issues/3673)–[#3676](https://github.com/magda-io/magda/issues/3676); [#3678](https://github.com/magda-io/magda/issues/3678) (create-bucket route path); [ts-module-alias-transformer#15](https://github.com/magda-io/ts-module-alias-transformer/issues/15); [#3680](https://github.com/magda-io/magda/issues/3680) (jsonwebtoken consolidation)

## Context

`magda-storage-api` is an authorization proxy in front of a MinIO gateway. The
original upload paths (`POST /v0/storage/upload/...` and `PUT /v0/storage/:bucket/*`)
buffered the **entire file into memory** before writing to MinIO (capped at
`uploadLimit`, default `100mb`), and downloads (`GET /v0/storage/:bucket/*`)
streamed but ignored the `Range` header. This meant: memory pressure scaling with
file size, a hard ~100 MB ceiling, single non-resumable requests, and no
resumable/seekable downloads.

We needed to support files up to ~10 GB (with headroom) while **preserving the
existing OPA + record-linked authorization model** and **without forcing an
ingress body-size increase** on every deployment.

## Decision

Two additive changes; all existing routes preserved.

1. **Download:** add HTTP Range support to the existing `GET /v0/storage/:bucket/*`
   route (`Accept-Ranges: bytes`; `206` + `Content-Range` for a satisfiable single
   range via `minio.getPartialObject`; `416` for unsatisfiable; full `200`
   otherwise). Authorization unchanged.

2. **Upload:** add S3 **multipart upload proxy** endpoints under
   `/v0/storage/multipart/{initiate,part,parts,complete,abort}/:bucket/*` that
   relay **one bounded part at a time** through storage-api to MinIO.

Key sub-decisions:

- **Proxy the bytes through storage-api** (rather than issuing presigned URLs for
  direct-to-MinIO transfer). This preserves the authorization model exactly and
  needs no MinIO exposure through the gateway. Cost: storage-api stays in the byte
  path. Memory is bounded by reading at most one part (`express.raw` limit =
  `maxPartSize`); the whole file is never buffered.
- **Stateless, signed upload session.** `initiate` returns a JWT (signed with the
  existing `jwtSecret`) as the `uploadId`, embedding `{bucket, objectKey, s3UploadId, userId, recordId, orgUnitId, contentType, exp}`. It's verified on
  every subsequent call and must match the URL's bucket/key — so it can't be
  replayed against a different object, and no server-side session store is needed.
- **Authorization timing.** The full `storage/object/upload` OPA decision runs at
  **initiate** and again at **complete** (where the object materializes). Part
  upload / list / abort are gated by the signed token only (no per-part OPA call);
  a large upload is hundreds of parts and permissions don't meaningfully change
  mid-upload.
- **Per-request body ≤ one part decouples ingress from file size.** With multipart
  the largest request body is a single part, so a modest, already-configured
  ingress limit supports arbitrarily large total files. Defaults:
  `recommendedPartSize=16mb` (advertised to clients — fits under the shipped
  `proxyBodySize: 100M` with no reconfiguration, is ~3× the 5 MB S3 part floor,
  keeps 10 GB ≈ 640 parts and 100 GB under the 10,000-part cap, and stays under
  Node's 300 s `requestTimeout` even on slow links) and `maxPartSize=64mb` (server
  `express.raw` ceiling that bounds per-part memory).
- **Housekeeping.** A MinIO bucket lifecycle rule auto-aborts incomplete multipart
  uploads after `incompleteUploadExpiryDays` (default 7); the abort endpoint
  cleans up immediately. Applied at bucket creation; non-fatal if the backend
  doesn't support lifecycle config.

## Consequences

- Resumable, memory-bounded uploads to ~10 GB and resumable/seekable downloads,
  with the existing auth model intact and no ingress changes on a default deploy.
- storage-api CPU/network sits in the transfer path (accepted trade-off for
  keeping authorization centralized and MinIO unexposed).
- New config surface (`recommendedPartSize`, `maxPartSize`, `multipartUploadExpiry`,
  `incompleteUploadExpiryDays`) across `index.ts` yargs + Helm values/deployment.
- Clients must send auth (session or API key) on `initiate` **and** `complete`.

## Alternatives considered

- **Presigned URLs, direct to MinIO** (client uploads parts / downloads straight
  from MinIO): best offload/scalability, but requires exposing MinIO through the
  gateway and turns each presigned URL into a bearer token that bypasses
  fine-grained per-object authorization once issued. Rejected to keep the auth
  model and avoid MinIO exposure. (Dead presign helpers already in
  `MagdaMinioClient` were left untouched; removing them is future cleanup.)
- **Hybrid** (presigned for the heavy part transfer, storage-api orchestrates):
  balances offload vs. control but is the most complex. Rejected for this scope.

## Implementation notes / non-obvious decisions

- **minio v8 `uploadPart` is unusable for normal parts.** It parses the ETag from
  the response _body_ (expecting a `CopyPartResult`), but a plain `UploadPart`
  returns an empty body with the ETag in the response _header_ → it throws. We
  issue the part request directly (same shape minio builds) and read the ETag from
  the header. See `MagdaMinioClient.uploadPart`.
- **Route registration order is load-bearing.** Multipart routes are registered
  before the global body parsers (so the part route controls its own parsing) and
  before the generic `/:bucket/*` routes (so `multipart` isn't matched as a bucket).
- **Build: `compile` strips `.d.ts` before `ts-module-alias-transformer`.** The
  transformer aborts on a `.d.ts` containing declaration syntax / a
  `resolution-mode` reference directive (emitted once the client's public
  signatures reference Node types), silently leaving `.js` module aliases
  un-rewritten → runtime `Cannot find package 'magda-typescript-common'`. Stripping
  `.d.ts` (an app whose declarations nothing consumes) is the safe local fix;
  upstream fix tracked in
  [ts-module-alias-transformer#15](https://github.com/magda-io/ts-module-alias-transformer/issues/15).
- **`@types/jsonwebtoken` pinned to `9.0.5`.** 9.0.6+ imports `ms`'s `StringValue`,
  which breaks `tsc` (no `skipLibCheck` in the shared tsconfig). `jsonwebtoken`
  itself is `^9.0.2`, matching `magda-typescript-common`; repo-wide consolidation
  tracked in [#3680](https://github.com/magda-io/magda/issues/3680).
- The web client is intentionally **not** changed here; it keeps the single-shot
  upload for small files. Wiring it to the multipart flow is future work.

## Verification

Unit/integration tests (Mocha, against a local MinIO) cover range parsing, the
signed token, the MinIO client multipart methods, the Range download route, and
the multipart endpoints. End-to-end verification against a minikube deployment —
through the gateway, authenticated with an API key, as both the default admin and
a freshly-created admin user — is scripted in
`magda-storage-api/scripts/verify-large-file.mjs` (see
[E2E test case: Large file storage](../e2e-test-cases/large-file-storage.md)).
