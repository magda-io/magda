# mgd CLI End-to-End Test

## Purpose

Verify that the `@magda/mgd` CLI works correctly against a live MAGDA deployment, exercising the full authentication, search, dataset creation, file upload (small and multipart), file download with checksum verification, file replacement, dataset metadata update, custom aspect management, and cleanup flow — all through the gateway with an API key.

## Prerequisites

- A deployed MAGDA cluster accessible through the gateway (see [Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)).
- An admin-level API key for the target deployment. The test account needs permission to create dataset and distribution records, upload storage objects, create aspect definitions, and delete records.
- Node.js ≥ 22 on the host running the script.
- The `@magda/mgd` package built locally (run `yarn build` in `packages/mgd/` first), or installed globally via `npm install -g @magda/mgd`.

## How to Run

From the repository root, build the package first:

```sh
cd packages/mgd
yarn build
```

Then run the verification script with the required environment variables:

```sh
MGD_E2E_BASE_URL=https://<your-gateway-url> \
MGD_E2E_API_KEY_ID=<your-api-key-id> \
MGD_E2E_API_KEY=<your-api-key-value> \
  node scripts/verify-mgd.mjs
```

The script resolves the `mgd` binary from `packages/mgd/bin/mgd.js` relative to itself, so no global installation is needed when running from a local build.

## What the Script Verifies

1. **auth status** — the API key authenticates successfully.
2. **search datasets** — keyword search returns results without error.
3. **dataset create** — a throwaway dataset record is created and its ID matches the `magda-ds-` prefix.
4. **add-file small** — a small CSV is uploaded and a distribution is created with a `magda-dist-` ID.
5. **add-file large (multipart)** — a 20 MB binary (above the 16 MB multipart threshold) is uploaded via multipart, then downloaded and compared with a SHA-256 checksum to confirm round-trip integrity.
6. **replace-file bumps version** — the small distribution's backing file is replaced and the returned `versionNumber` is at least 1.
7. **dataset update + custom aspect** — the dataset description is updated and a custom aspect definition is created and attached to the dataset.
8. **cleanup** — all distribution records and the dataset record are deleted via raw API calls.

## Expected Output

```
ok   - auth status
ok   - search datasets
ok   - dataset create
ok   - add-file small
ok   - add-file large (multipart)
ok   - replace-file bumps version
ok   - dataset update + custom aspect
ok   - cleanup

ALL CHECKS PASSED
```

If any check fails, the script prints `FAIL - <name>: <error>` and exits with code 1. Checks after a failed `dataset create` may also fail because subsequent steps depend on the dataset ID being set.

## Orphan Storage Objects

The cleanup step deletes registry records (dataset and distribution) but does **not** directly delete the underlying storage objects in the object store. MAGDA's storage lifecycle is registry-driven, so orphan objects in the bucket are acceptable for a dedicated e2e verification account and will not interfere with production data. If running against a shared environment, arrange a separate storage cleanup or use a purpose-built test tenant.
