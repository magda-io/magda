Running MAGDA Connectors on your local machine is straightforward.

```
cd magda-ckan-connector
npm run dev -- --config ../deploy/connector-config/data-gov-au.json
```

That will create new organizations, datasets, and distributions on the registry running on `http://localhost:6100/v0/`.  You can use a different registry by specifying it on the command-line:

```
npm run dev -- --config ../deploy/connector-config/data-gov-au.json --registryUrl "http://some.other.host.example.com/api/v0/"
```

Running the connectors as jobs on the Kubernetes cluster requires a few more steps.  First, you need to create a Kubernetes ConfigMap from the connector configuration files:

```
cd deploy
npm run create-connector-configmap
```

Then, you need to build a Docker image for each type of connector.  For use on a local minikube cluster, run:

```
cd magda-ckan-connector
npm run docker-build-local
```

Or, for use on a dev or production cluster, run:

```
cd magda-ckan-connector
npm run docker-build-prod
```

`docker-build-local` and `docker-build-prod` differ in which Docker registry they use (http://localhost:5000 for `local` and the default registry for `prod`) and the version they are tagged with (`latest` for `local` and the version in `package.json` for `prod`).

Then, create a Kubernetes job and cronjob configuration for each connector in `deploy/connector-config` by running:

```
cd deploy
npm run generate-connector-jobs-local
# `npm run generate-connector-jobs-prod` instead for dev/production.
```

Finally, start the jobs by running:

```
kubectl create -f deploy/kubernetes/generated/local/
# `kubectl create -f deploy/kubernetes/generated/prod/` in dev/production.
```

Note that if your cluster does not support cronjobs (as is currently the case on GKE), you'll get errors for each of the cronjob files.
