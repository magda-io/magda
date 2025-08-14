# storage-api

![Version: 5.4.0](https://img.shields.io/badge/Version-5.4.0-informational?style=flat-square)

A Helm chart for Kubernetes

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| oci://ghcr.io/magda-io/charts | minio | 7.1.2 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| authApiUrl | string | `"http://authorization-api/v0"` | The URL of the authorization API |
| autoCreateBuckets | bool | `true` | Create `defaultBuckets` on startup. |
| autoCreateSecrets | bool | `true` | Whether or not auto create `storage-secrets`. When auto created, random 20 chars will be generated for `accessKey` and random 40 chars will be generated for `secretKey`. When use minio as gateway mode, you might want to manualy generate the secret in order supply cloud provider secrets. e.g. <ul>   <li>awsAccessKeyId: aws s3 access key id if use AWS s3</li>   <li>awsSecretAccessKey: aws s3 secret access key id if use AWS s3</li>   <li>gcs_key.json: GCS key file if use google GCS</li> </ul> |
| defaultBuckets | list | `[]` | Default buckets to create on startup. If no value is provided `global.defaultDatasetBucket` will be used. |
| defaultImage.pullPolicy | string | `"IfNotPresent"` |  |
| defaultImage.pullSecrets | bool | `false` |  |
| defaultImage.repository | string | `"ghcr.io/magda-io"` |  |
| image.name | string | `"magda-storage-api"` |  |
| listenPort | int | `6121` | The port for storage api to listen on |
| minio.DeploymentUpdate.type | string | `"Recreate"` |  |
| minio.existingSecret | string | `"storage-secrets"` |  |
| minio.fullnameOverride | string | `"magda-minio"` |  |
| minio.host | string | `"minio"` |  |
| minio.nameOverride | string | `"magda-minio"` |  |
| minio.persistence.size | string | `"10Gi"` |  |
| minio.port | int | `9000` |  |
| minio.resources.requests.memory | string | `"256Mi"` |  |
| minioEnableSSL | bool | `false` | Whether or not to connect to minio server with SSL connection |
| minioRegion | string | "unspecified-region" | specify bucket region |
| registryApiUrl | string | `"http://registry-api/v0"` | The URL of the registry API |
| resources.limits.cpu | string | `"50m"` |  |
| resources.requests.cpu | string | `"10m"` |  |
| resources.requests.memory | string | `"30Mi"` |  |
| skipAuth | bool | `false` | when set to true, API will not query policy engine for auth decision but assume it's always permitted.  It's for debugging only. |
| tenantId | int | `0` | The tenant ID to use for the storage API |
| uploadLimit | string | `"100mb"` | the file upload size limit of the storage API |

### Use minio as Storage Gateway

By default, the storage api will use minio to create in-cluster storage (Persistent Volumes).

To use minio as cloud storage service gateway while still enjoy the standard s3 compatible API, you can set the Helm chart config as the followings:

> Please note: When using MinIO as a storage gateway, you will often need to manually create storage buckets via cloud vendors, as there are typically requirements for bucket names. For example, in AWS S3, the bucket name must be globally unique and DNS-compliant.
> Therefore, you should set autoCreateBuckets to false to prevent the storage-api from automatically creating default buckets (e.g., the default dataset storage bucket).
> In this case, you should also set global.defaultDatasetBucket to the name of the bucket you created manually as well.

#### use AWS S3 as storage target

```yaml
storage-api:
  minioRegion: "xxxxx" # e.g. australia-southeast1
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    s3gateway:
      enabled: true
      replicas: 1
      serviceEndpoint:  ‘xxxxxx’
```

To pass the AWS s3 credential, you need to add keys:
- `awsAccessKeyId`
- `awsSecretAccessKey`

to secret named `storage-secrets`.

#### use Google Cloud Storage (GCS) as storage target

```yaml
storage-api:
  minioRegion: "xxxxx" # e.g. australia-southeast1
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    gcsgateway:
      enabled: true
      # Number of parallel instances
      replicas: 1
      # Google cloud project-id
      projectId: ""
```

To pass the GCS credentials (json file of service account key), you need to add the key `gcs_key.json` to secret named `storage-secrets`.  The content of the ``gcs_key.json` key should be your GCS JSON key file.

> You can also leverage Google [Workload Identity](https://cloud.google.com/kubernetes-engine/docs/how-to/workload-identity) feature to achieve no key / secret authentication to GCS by setting `storage-api.minio.gcsgateway.authKsa` to `true`.
> Workload Identity allows pods in your GKE clusters to impersonate Identity and Access Management (IAM) service accounts (GSA) to access Google Cloud services (e.g. GCS).

To achieve that your need to:
- Create a GSA (GCP Service Account) and grant it sufficient permissions by assign a custom role or built-in roles.
  - Please note: you will need "list buckets" permission to make the default minio UI work. But you don't have to grant this permission if you don't use the UI.
- Make sure workload identity is enabled for your cluster and node pools
  - Refer to the Workload Identity doc link above
- Create two way bindings from minio KSA (k8s service account) to GSA and GSA to minio KSA
  - By default, the minio KSA name is `magda-minio`
  - You can create the two way binding with commands:

```bash
# Link KSA to GSA in GCP
# you need to set env var `PROJECT_ID` before run it
# here we assume `magda-namespace` is the magda deployment namespace and `magda-minio` is the minio KSA name
# You should replace `[GCP service account full email]` with the actual GSA full email address
gcloud iam service-accounts add-iam-policy-binding \
    --project $PROJECT_ID \
    --role roles/iam.workloadIdentityUser \
    --member "serviceAccount:$PROJECT_ID.svc.id.goog[magda-namespace/magda-minio]" \
    [GCP service account full email]
```

```bash
# Link KSA to GSA in Kubernetes
# here we assume `magda-namespace` is the magda deployment namespace and `magda-minio` is the minio KSA name
# You should replace `[GCP service account full email]` with the actual GSA full email address
kubectl annotate serviceaccount --namespace=magda-namespace magda-minio \
    "iam.gke.io/gcp-service-account=[GCP service account full email]"
```

And your helm config should be:

```yaml
storage-api:
  minioRegion: "xxxxx" # e.g. australia-southeast1
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    gcsgateway:
      enabled: true
      # turn on auth via KSA / Google Workload Identity
      authKsa: true
      # Number of parallel instances
      replicas: 1
      # Google cloud project-id
      projectId: ""
```

#### use azure blob as storage target

```yaml
storage-api:
  minioRegion: "xxxxx"
  # stop auto create `storage-secrets`, as we need to manually create with storage account name & key
  autoCreateSecrets: false
  minio:
    persistence:
      # turn off in-cluster storage
      enabled: false
    azuregateway:
      enabled: true
      # Number of parallel instances
      replicas: 1
```

You also need to manually create secrets `storage-secrets` that contains the following keys:
- `accesskey`: azure storage account name
- `secretkey`: azure storage account key

> more minio related configuration option can be found at: https://github.com/magda-io/minio-charts/tree/5bb5fe5f2c67e69d9b436f95511c3a0252cdb759/minio#configuration