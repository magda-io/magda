NOTE: Work in progress... this probably won't work 100% for you. But it's a start :).

1.  Connect to the cluster you want to deploy on with kubectl
2.  Install helm https://github.com/kubernetes/helm/blob/master/docs/install.md
3.  Create secrets:

```bash
deploy/helm/create-auth-secrets.sh
```

4.  Find out the latest release version from https://github.com/TerriaJS/magda/releases
5.  Copy deploy/helm/search-data.gov.au and adapt it to create your helm config. Important options:

*   **useCombinedDb**: Do you want each db-using service to have its own db, or use one big combined one?
*   **useCloudSql**: Do you want to use Google Cloud SQL for the databases? This should be used with `useCombinedDb=false`
*   **externalUrl**: What's the external url that you'll be deploying the website on? This is used for OAuth2 callback URLs
*   **indexer.elasticsearch.useGcsSnapshots**: Do you want to have elasticsearch snapshot to GCS? If so you'll need to create a GCS bucket for it, and set that in gcsSnapshotBucket. You'll also need to make sure your GKE cluster has access to GCS when you create it.
*   **gateway.loadBalancerIP**: What's the external IP you want to use?
*   **gateway.auth.x**: Put the ids of your google/facebook apps for OAuth if you have them. You'll also need to create an `oauth-secrets` secret containing a `facebook-client-secret` and `google-client-secret`.
*   **feedback-api.gitHubIssuesUrl**: Put the API URL of your (private) GitHub repo where feedback issues will be created, e.g. `https://api.github.com/repos/TerriaJS/Magda-Feedback/issues`. You also need to create secret called `access-tokens` with a key `github-for-feedback` containing a personal access token with permissions to create issues in the private repo.

If using Google Cloud SQL follow the instructions here https://cloud.google.com/sql/docs/mysql/connect-kubernetes-engine

6.  Create db passwords (change the passwords and make them all different!):

```bash
kubectl create secret generic db-passwords --from-literal=combined-db=p4ssw0rd --from-literal=authorization-db=p4ssw0rd --from-literal=discussions-db=p4ssw0rd --from-literal=session-db=p4ssw0rd  --from-literal=registry-db=p4ssw0rd --from-literal=combined-db-client=p4ssw0rd --from-literal=authorization-db-client=p4ssw0rd --from-literal=discussions-db-client=p4ssw0rd --from-literal=session-db-client=p4ssw0rd --from-literal=registry-db-client=p4ssw0rd
```

6.  If using automatic backups for elasticsearch or postgres, add the service account for putting these into Google Cloud Storage:

```bash
kubectl create secret storage-account-credentials --from-file=[YOUR-SERVICE-ACCOUNT-JSON]
```

7.  Install MAGDA:

```bash
helm install --name magda deploy/helm/magda -f <path to your config file>
```

8.  Create crawling jobs (until we get the admin interface up to scratch)

```bash
cd deploy
yarn run create-connector-configmap
yarn run generate-connector-jobs-prod
kubectl create -f kubernetes/generated/prod/
```

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
