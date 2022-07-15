### Deploy Dev Cluster Nginx Ingress Controller

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm -n ingress-controller upgrade ingress-controller ingress-nginx/ingress-nginx --install -f dev-cluster-config.yaml
```