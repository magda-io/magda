# Storage API

Magda service to store/retrieve files.

The service stores files to a [MinIO](https://min.io/) server in a specified MinIO bucket.

## Running

[The Example Config](./config.example.json) should give an idea on the structure of the
expected config file. Create a `config.json` file with the appropriate parameters.

```json5
// Example Config
{
    listenPort: 6120,
    bucket: "", // name of the bucket to do operations on
    minioAccessKey: "", // You would have specified this when creating the MinIO server
    minioSecretKey: "", // You would have specified this when creating the MinIO server
    minioEnableSSL: true,
    minioServerHost: "localhost",
    minioServerPort: 9000
}
```

If you do not have `yarn` installed, install `yarn` via:

```console
sudo npm install yarn -g
yarn -v
```

From the `magda-storage-api` directory, run:

```console
yarn run dev
```

## API

### GET /:recordid

Attempts to retrieve content with the name `<recordid>` from the MinIO server
that is stored in the bucket specified in config while starting the server.

#### Example usage

```console
$ curl -X GET localhost:6120/v0/myFavouriteCSV
column1,column2
A,1234
B,4321
C,2007
```

### POST /:recordid

Attempts to upload content to the MinIO bucket. Gives it a name `<recordid>` and returns a unique etag
if the upload is successfull.

#### Example usage

```console
$ curl -X POST -H "Content-Type:text/csv" localhost:6120/v0/myFavouriteCSV --data-binary '@favourite.csv'
{"message":"File uploaded successfully","etag":"<some hash value>"}
```

### Note

The service does not come with authentication or authorization.

## Features in backlog

-   [ ] Bucket name to be specified in the request, not at startup
-   [ ] Endpoint to delete an object
