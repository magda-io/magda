# Running Magda on Minikube without building Docker images

These instructions will help you to set up Magda without building
any of the docker images. These instructions were tested on a Mac
running MacOS 10.15.7 (Catalina).

These instructions install Magda into its own `magda` namespace.

## Prerequisites

(Installed via homebrew unless otherwise noted)

1. [minikube](https://minikube.sigs.k8s.io/docs/start/)
2. [Docker Desktop](https://www.docker.com/products/docker-desktop): Docker Desktop comes wit the hyperkit driver that used by minikube
3. [kubectl](https://kubernetes.io/docs/tasks/tools/)
4. [nvm](https://github.com/nvm-sh/nvm): nvm is used for managing NodeJs version. We need either NodeJs 12
5. [helm](https://helm.sh/)

Optional, but highly recommended:

-   [k9s](https://github.com/derailed/k9s)

## Preparation

### Starting Kubernetes

```bash
minikube config set driver hyperkit

# you can lower / higher CPU / memory depends on your hardware.
# Min. requirement: memory 6GB & CPU: 2
minikube config set kubernetes-version v1.16.5
minikube config set memory 16384
minikube config set cpus 4
minikube config set dashboard true
minikube config set disk-size 60G
minikube start
```

Install the prerequisites.
Then:

```bash
helm repo add magda-io https://charts.magda.io
helm repo add twuni https://helm.twun.io
# Get update from repos
helm repo update
```

And:

```bash
git clone https://github.com/magda-io/magda.git
cd magda
```

Then, following the instructions:

```bash
helm install docker-registry -f deploy/helm/docker-registry.yml twuni/docker-registry
helm repo add mittwald https://helm.mittwald.de
helm repo update
kubectl create namespace kubernetes-replicator
helm upgrade --namespace kubernetes-replicator --install kubernetes-replicator mittwald/kubernetes-replicator
```

Edit the file at `deploy/helm/minikube-dev.yaml` to comment out these lines:

```yaml
# image:
#   repository: "localhost:5000/data61"
#   tag: "latest"
#   pullPolicy: Always
```

Then create secrets (and, for output see the bottom of this file) :

```bash
nvm use 12
nvm alias default 12
npm install --global @magda/create-secrets
export CLUSTER_NAMESPACE=magda
create-secrets
```

Then:

```bash
# update magda helm repo
helm repo update

# update magda chart dependencies
yarn update-all-charts

# deploy the magda chart from magda helm repo
kubectl create namespace magda
helm upgrade --install --timeout 9999s -n magda -f deploy/helm/minikube-dev.yml magda deploy/helm/local-deployment
```

You can use `k9s` to monitor the start-up of Magda.

> Please note: you need to provide working SMTP server credentials to get correspondence-api pod running properly. You can simply ignore its error status for simply demo purpose.

### SSL/HTTPS access to Magda

In order to have https access, you can follow the [setup instruction doc](./how-to-setup-https-to-local-cluster.md).

### Setting up a local admin user

You can follow the [instruction doc here](./how-to-create-local-users.md).

### Generate API keys for the user

You can follow the [instruction doc here](./how-to-create-api-key.md).
