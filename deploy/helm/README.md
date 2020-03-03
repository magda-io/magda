To deploy open-faas:
```bash
kubectl apply -f https://raw.githubusercontent.com/openfaas/faas-netes/master/namespaces.yml
helm upgrade --namespace openfaas --install --timeout 9999 --wait --set tags.all=false --set global.deployOpenfaas=true openfaas deploy/helm/magda
```

To deploy magda:
```
helm upgrade --namespace magda --install --timeout 9999 --wait -f deploy/helm/minikube-dev.yml magda deploy/helm/magda
```