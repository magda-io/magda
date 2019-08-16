# Developer Note on Access Control

The access control integration test is not fully automated yet.
Follow the instructions to perform test on your local development box.

### Deploy combined-db with authorization-db and registry-db

For example, if using namespace test2, run

```
helm upgrade test2 deploy/helm/magda --namespace test2 --install --recreate-pods -f deploy/helm/local-auth-test.yml --set tags.all=false --set tags.combined-db=true --set tags.authorization-db=true --set tags.registry-db=true
```

If on Windows 10, run

```
helm upgrade test2 deploy/helm/magda --namespace test2 --install --recreate-pods -f deploy/helm/local-auth-test.yml -f deploy/helm/docker-desktop-windows.yml --set tags.all=false --set tags.combined-db=true --set tags.authorization-db=true --set tags.registry-db=true
```

You might need to delete your existing volume first

```
kubectl delete pv local-storage-volume
```

then create a new volume for the new database

```
kubectl apply -f deploy/kubernetes/local-storage-volume.yaml
```

### Populate table org_units by executing data/organizations.sql in auth db.

### Populate table users and assign user roles by executing data/users.sql in auth db.

### Start opa server

```
cd deploy/helm/magda/charts/opa
docker-compose up
```

### Start authorization service

```
cd magda-authorization-api
yarn dev
```

### Start the integration test RecordsOpaSpec
