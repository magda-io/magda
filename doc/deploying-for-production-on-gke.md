NOTE: Work in progress... this probably won't work 100% for you. But it's a start :).

1. Connect to the cluster you want to deploy on with minikube
2. Install helm https://github.com/kubernetes/helm/blob/master/docs/install.md
3. Create secrets: deploy/helm/create-auth-secrets.sh
4. Find out the latest release version from https://github.com/TerriaJS/magda/releases
5. Copy deploy/helm/search-data.gov.au and adapt it to create your helm config. Important options:
  - **useCombinedDb**: Do you want each db-using service to have its own db, or use one big combined one?
  - **externalUrl**: What's the external url that you'll be deploying the website on? This is used for OAuth2 callback URLs
  - **indexer.elasticsearch.useGcsSnapshots**: Do you want to have elasticsearch snapshot to GCS? If so you'll need to create a GCS bucket for it, and set that in gcsSnapshotBucket. You'll also need to make sure your GKE cluster has access to GCS when you create it.
  - **gateway.loadBalancerIP**: What's the external IP you want to use?
  - **gateway.auth.x**: Put the ids of your google/facebook apps for OAuth if you have them. You'll also need to create an `oauth-secrets` secret containing a `facebook-client-secret` and `google-client-secret`.
  - **feedback-api.gitHubIssuesUrl**: Put the API URL of your (private) GitHub repo where feedback issues will be created, e.g. `https://api.github.com/repos/TerriaJS/Magda-Feedback/issues`. You also need to create secret called `access-tokens` with a key `github-for-feedback` containing a personal access token with permissions to create issues in the private repo.

5. Create db passwords (change the passwords and make them all different!):
If `useCombinedDb=true`:
```bash
kubectl create secret generic db-passwords --from-literal=combined-db=p4ssw0rd --from-literal=combined-db-client=p4ssw0rd --from-literal=auth-db-client=p4ssw0rd --from-literal=discussions-db-client=p4ssw0rd --from-literal=session-store-client=p4ssw0rd --from-literal=registry-datastore-client=p4ssw0rd --from-literal=elasticsearch=p4ssw0rd
```
If `useCombinedDb=false`
```bash
kubectl create secret generic db-passwords --from-literal=auth-db=p4ssw0rd --from-literal=discussions-db=p4ssw0rd --from-literal=session-store=p4ssw0rd  --from-literal=registry-datastore=p4ssw0rd --from-literal=auth-db-client=p4ssw0rd --from-literal=discussions-db-client=p4ssw0rd --from-literal=session-store-client=p4ssw0rd --from-literal=registry-datastore-client=p4ssw0rd --from-literal=elasticsearch=p4ssw0rd
```

6. Install MAGDA:
```bash
helm install --name magda deploy/helm/magda --f <path to your config file>
```
7. Create crawling jobs (until we get the admin interface up to scratch)
```bash
cd deploy
npm run create-connector-configmap
npm run generate-connector-jobs-prod
kubectl create -f kubernetes/generated/prod/
```

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
