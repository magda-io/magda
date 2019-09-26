## Note

If this esri portal connector is deployed, the search api and the registry histroy APIs must be disabled because esri access control has not been implemented yet for those APIs at the moment.

## Building

```bash
yarn run build
yarn docker-build-local
```

## Running

```bash
kubectl port-forward registry-api-full-ddc5c44f4-v2llv 6101:80

node dist/index.js --id='someportal' --name='esriportal' --sourceUrl='https://someportal/arcgis' --userId=rowanwinsemius --jwtSecret="squirrel"
```

## Minikube Deployment

(Create secrets in namespace `test` first.)

### On Windows Platform

```
PS magda> helm upgrade test deploy/helm/magda --install --recreate-pods --namespace test  -f deploy/helm/docker-desktop-windows.yml -f deploy/helm/minikube-esri-dev.yml --timeout 3600 --wait
```
