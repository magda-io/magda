1. Install minikube https://github.com/kubernetes/minikube/releases
2. Install helm https://github.com/kubernetes/helm/blob/master/docs/install.md
3. Create secrets: deploy/helm/create-auth-secrets.sh
4. Find out the latest release version from https://github.com/TerriaJS/magda/releases
5. Install MAGDA: `helm install --name magda deploy/helm/magda --set global.image.tag=<LATEST-RELEASE-GOES-HERE>`

If this doesn't work for you, [file an issue](https://github.com/TerriaJS/magda/issues).
