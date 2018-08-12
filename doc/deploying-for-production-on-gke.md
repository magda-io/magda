NOTE: Work in progress... this probably won't work 100% for you. But it's a start :).

1.  Connect to the cluster you want to deploy on with kubectl
2.  Install helm https://github.com/kubernetes/helm/blob/master/docs/install.md
3.  Create necessary k8s secrets:

Please run `create-secrets` tool:

```bash
`yarn bin`/create-secrets
```

and follow the instructions.

4.  Find out the latest release version from https://github.com/TerriaJS/magda/releases
5.  Copy deploy/helm/search-data.gov.au and adapt it to create your helm config. Important options:

-   **useCombinedDb**: Do you want each db-using service to have its own db, or use one big combined one?
-   **useCloudSql**: Do you want to use Google Cloud SQL for the databases? This should be used with `useCombinedDb=false`
-   **externalUrl**: What's the external url that you'll be deploying the website on? This is used for OAuth2 callback URLs
-   **indexer.elasticsearch.useGcsSnapshots**: Do you want to have elasticsearch snapshot to GCS? If so you'll need to create a GCS bucket for it, and set that in gcsSnapshotBucket. You'll also need to make sure your GKE cluster has access to GCS when you create it.
-   **gateway.loadBalancerIP**: What's the external IP you want to use?
-   **gateway.auth.x**: Put the ids of your google/facebook apps for OAuth if you have them.
-   **feedback-api.gitHubIssuesUrl**: Put the API URL of your (private) GitHub repo where feedback issues will be created, e.g. `https://api.github.com/repos/TerriaJS/Magda-Feedback/issues`. You also need to create secret called `access-tokens` with a key `github-for-feedback` containing a personal access token with permissions to create issues in the private repo (this secret is currently not covered by `create-secrets` tool in step 2).

If using Google Cloud SQL follow the instructions here https://cloud.google.com/sql/docs/mysql/connect-kubernetes-engine

6.  Install MAGDA:

```bash
helm install --name magda deploy/helm/magda -f <path to your config file>
```

7.  Create crawling jobs (until we get the admin interface up to scratch)

```bash
cd deploy
yarn run create-connector-configmap
yarn run generate-connector-jobs-prod
kubectl create -f kubernetes/generated/prod/
```

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
