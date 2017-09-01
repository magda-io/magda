DRAFT: This doesn't work exactly like this yet, but it will!

1. Install minikube https://github.com/kubernetes/minikube/releases
2. Install helm https://github.com/kubernetes/helm/blob/master/docs/install.md
3. Create secrets: deploy/helm/create-auth-secrets.sh
4. Install MAGDA: `helm install --name magda deploy/helm/magda`
