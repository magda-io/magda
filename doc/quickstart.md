1.  Set up a kubernetes cluster on your cloud of choice, or to run locally install [minikube](./installing-minikube.md) or a version of [docker with kubernetes](./installing-docker-k8s.md)
2.  Install helm: https://github.com/kubernetes/helm/blob/master/docs/install.md and

```bash
kubectl apply -f deploy/kubernetes/rbac-config.yaml
helm init --service-account tiller
helm init
```

3.  Create necessary config

```bash
kubectl create configmap config --from-file deploy/kubernetes/config
kubectl create configmap connector-config --from-file deploy/connector-config
```

4.  Create necessary k8s secrets

Please run `create-secrets` tool:

```bash
`yarn bin`/create-secrets
```

and follow the instructions.

5.  Find out the latest release version from https://github.com/TerriaJS/magda/releases
6.  Install MAGDA:

```bash
helm install --name magda deploy/helm/magda --set global.image.tag=<LATEST-RELEASE-GOES-HERE> --set global.noDbAuth=true
```

7.  Populate with data from data.gov.au:

```bash
kubectl create -f deploy/kubernetes/generated/local/connector-data-gov-au.json
```

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
