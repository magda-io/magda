# E2E Test Case: Large file storage (multipart upload + Range download)

A concrete, scripted end-to-end test case for `magda-storage-api`'s large-file
support, run **through the gateway with an API key**. It builds on the shared
setup in
[Feature-specific testing through the gateway with an API key](../e2e-cluster-deployment-test.md#feature-specific-testing-through-the-gateway-with-an-api-key)
— follow steps 1–3 there first to expose the gateway (`$BASE`) and obtain an API
key (`API_KEY_ID` / `API_KEY`).

## What it covers

`magda-storage-api` supports resumable large-file uploads via S3 multipart proxy
endpoints and resumable/seekable downloads via HTTP Range on the existing
`GET /api/v0/storage/{bucket}/{path}` route. The multipart endpoints are:

- `POST /api/v0/storage/multipart/initiate/{bucket}/{path}` — authorize + start; returns a signed `uploadId` and part-size guidance.
- `PUT /api/v0/storage/multipart/part/{bucket}/{path}?uploadId=&partNumber=N` — upload one part.
- `GET /api/v0/storage/multipart/parts/{bucket}/{path}?uploadId=` — list uploaded parts (resume).
- `POST /api/v0/storage/multipart/complete/{bucket}/{path}?uploadId=` — finalize (body `{parts:[{partNumber,etag}]}`).
- `DELETE /api/v0/storage/multipart/abort/{bucket}/{path}?uploadId=` — discard.

Key properties this case verifies:

- Because each request carries at most one part, the per-request body stays under
  the default `proxyBodySize: 100M` ingress limit regardless of total file size —
  so a **> 100 MB** file uploads with **no ingress reconfiguration**.
- `initiate` and `complete` run the full `storage/object/upload` authorization
  decision, so **both must be authenticated** (part / list / abort are gated by
  the signed `uploadId` token only).
- Downloads advertise `Accept-Ranges: bytes` and return `206 Partial Content`
  with a correct `Content-Range` for `Range` requests, so a large object can be
  fetched (and resumed) in pieces with matching checksums.
- A bucket lifecycle rule auto-aborts incomplete uploads after
  `incompleteUploadExpiryDays` (default 7).

## Run the driver script

A driver script exercises the whole flow (initiate → upload parts → complete →
full + ranged download with checksum match → abort). With `$BASE` reachable and
an API key from the shared setup:

```bash
BASE_URL=$BASE/api/v0/storage API_KEY_ID=<API_KEY_ID> API_KEY=<API_KEY> \
  SIZE_MB=200 KEY="verify/large-file/e2e-$(date +%s).bin" \
  node magda-storage-api/scripts/verify-large-file.mjs
```

Expected output ends with `ALL CHECKS PASSED`.

The script's auth is pluggable: pass `API_KEY_ID` + `API_KEY` (the real external
path, recommended) or, for a quick internal check, `JWT` (an `X-Magda-Session`
token). Other env vars: `BUCKET` (default `magda-datasets`), `SIZE_MB` (default
`500`), and `KEY` (the object key — use a fresh one per run).

## Notes

- **Use a fresh object key per run** (`KEY=...`). Re-running against a key that
  has a leftover incomplete multipart upload (e.g. from an interrupted run) can
  make `complete` return `400`.
- Verified against a real minikube deployment for both the default admin and a
  freshly-created admin user, each authenticating solely with their API key.

## Cleanup

The script deletes the object it uploads. Additionally, per the shared setup,
restore the gateway service, stop `minikube tunnel`, and remove any throwaway
test user / API key you created. Abandoned incomplete multipart uploads (if any)
are cleaned up automatically by the bucket lifecycle rule after
`incompleteUploadExpiryDays`.
