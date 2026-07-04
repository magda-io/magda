# Storage API

Magda service to store/retrieve files.

The service stores files to a [MinIO](https://min.io/) server in a specified MinIO bucket.

## Running

[The Example Config](./config.example.json) should give an idea on the structure of the
expected config file. Create a `config.json` file with the appropriate parameters.

```json5
// Example Config
{
  listenPort: 6121,
  minioAccessKey: "", // You would have specified this when creating the MinIO server
  minioSecretKey: "", // You would have specified this when creating the MinIO server
  minioEnableSSL: true,
  minioHost: "localhost",
  minioPort: 9000,
  tenantId: 0,
  uploadLimit: "100mb"
}
```

If you do not have `yarn` installed, install `yarn` via:

```console
$ sudo npm install yarn -g
$ yarn -v
```

From the `magda-storage-api` directory, run:

```console
$ yarn run dev
Storage API started on port 6121
```

## API

### PUT /buckets/:bucketid

Attempts to create a bucket with the name `<bucketid>`.

_Note:_ If the bucket exists, the request will not fail.

#### Example usage

```console
$ curl -X PUT localhost:6121/v0/buckets/test-bucket
{"message":"Bucket test-bucket created successfully in unspecified region 🎉"}
```

### PUT /:bucket/:fileid

Attempts to upload content to the MinIO `<bucket>`. Gives it a name `<fileid>` and returns a unique etag
if the upload is successfull. A `recordId` must be passed through as a query parameter.

#### Example usage

```console
$ cat ./favourite.csv
column1,column2
A,1234
B,4321
C,2007
$ curl -X PUT -H "Content-Type:text/csv" localhost:6121/v0/test-bucket/myFavouriteCSV?recordId=ds-dga-ab7eddce-84df-4098-bc8f-500d0d9776f1 --data-binary '@favourite.csv'
{"message":"File uploaded successfully","etag":"<some hash value>"}
```

### GET /:bucket/:fileid

Attempts to retrieve content with the name `<fileid>` from the MinIO server
that is stored in `<bucket>`.

#### Example usage

```console
$ curl -X GET localhost:6121/v0/test-bucket/myFavouriteCSV
column1,column2
A,1234
B,4321
C,2007
```

### DELETE /:bucket/:fileid

Deletes object with the name `<fileid>` from the MinIO server
that is stored in `<bucket>`.

_Note_ Does **not** throw an error if the object does not exist.

#### Example usage

```console
$ curl -X DELETE localhost:6121/v0/test-bucket/myFavouriteCSV
{ message: "File deleted successfully" }
```

### Note

The service does not come with authentication or authorization on all endpoints.

## Large file support

Large files are supported via S3 **multipart upload** proxy endpoints
(`/v0/storage/multipart/{initiate,part,parts,complete,abort}/...`) and **HTTP
Range** requests on `GET /v0/storage/:bucket/:fileid`. See the apidoc comments in
`src/` (rendered by the apidocs-server) for the full contract, and
[ADR 0001: Large file storage support](../docs/docs/adrs/0001-large-file-storage-support.md)
for the design rationale and key decisions.

## Build notes

Two non-obvious choices live in `package.json` — which, being JSON, can't carry
inline comments (both also covered in [ADR 0001](../docs/docs/adrs/0001-large-file-storage-support.md)):

- **`compile` strips `.d.ts` before running `ts-module-alias-transformer`**
  (`tsc -b && rimraf "dist/**/*.d.ts" && ts-module-alias-transformer dist`). The
  transformer aborts when it hits a `.d.ts` containing declaration syntax / a
  `resolution-mode` reference directive, silently leaving the `.js` module
  aliases un-rewritten (runtime `Cannot find package 'magda-typescript-common'`).
  This service is an app whose `.d.ts` nothing consumes, so stripping them is
  safe. Tracked upstream:
  <https://github.com/magda-io/ts-module-alias-transformer/issues/15>
- **`@types/jsonwebtoken` is pinned to `9.0.5`** (not `^9.0.6`). 9.0.6+ imports
  `ms`'s `StringValue`, which breaks `tsc` because the shared `tsconfig-global`
  has no `skipLibCheck`.
