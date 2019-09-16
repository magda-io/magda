## Building

```bash
yarn run build
```

## Running

```bash
kubectl port-forward registry-api-full-ddc5c44f4-v2llv 6101:80

node dist/index.js --id='someportal' --name='esriportal' --sourceUrl='https://someportal/arcgis' --userId=rowanwinsemius --jwtSecret="squirrel"
```
