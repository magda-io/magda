# Running Magda on Minikube without building Docker images

These instructions will help you to set up Magda without building
any of the docker images. These instructions were tested on a Mac
running MacOS 10.15.7 (Catalina).

These instructions install Magda into its own `magda` namespace.

## Prerequisites

(Installed via homebrew unless otherwise noted)

1. minikube
2. hyperkit
3. kubernetes-cli
4. nvm

Optional, but highly recommended:

-   k9s

## Preparation

### Starting Kubernetes

```bash
minikube config set driver hyperkit

# Currently supported by Magda
minikube config set kubernetes-version v1.16.5
minikube config set memory 16384
minikube config set cpus 4
minikube config set dashboard true
minikube config set disk-size 60G
minikube start
```

### Starting Magda with the [Building-and-Running](https://magda.io/docs/building-and-running) instructions \*\*

\*\* Minus the building part.

Install the prerequisites on the Building-and-Running page.
Then:

```bash
helm repo add magda-io https://charts.magda.io
helm repo add twuni https://helm.twun.io
# Get update from repos
helm repo update
```

Those instructions are missing these steps (but I guess they're
implied):

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
nvm use lts/erbium
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

I suggest using `k9s` to monitor the start-up of Magda. Due to my configuration,
the `magda-auth` pods and the `correspondence-api` pod don't start properly, but that
is to be expected at this stage.

### SSL/HTTPS access to Magda

I would like to have https access, so following the link from the Building-and-Running page to
[here](https://magda.io/docs/how-to-setup-https-to-local-cluster.html):

```bash
kubectl apply --validate=false -f https://github.com/jetstack/cert-manager/releases/download/v1.0.4/cert-manager.crds.yaml

# If you haven't install jetstack helm chart repo yet
helm repo add jetstack https://charts.jetstack.io

# Create namespace for cert-manager
kubectl create namespace cert-manager

# If you use Helm v3+
helm install cert-manager jetstack/cert-manager --namespace cert-manager --version v1.0.4

kubectl apply -f https://gist.githubusercontent.com/t83714/51440e2ed212991655959f45d8d037cc/raw/7b16949f95e2dd61e522e247749d77bc697fd63c/selfsigned-issuer.yaml

minikube addons enable ingress
```

Using the `ingress.yaml` file (see below) and adding `minikube ip` to /etc/hosts,

```bash
kubectl -n magda apply -f ingress.yaml
```

Connecting a Chrome browser to https://minikube.data.gov.au, I downloaded the ssl
cert, added it to my keychain and set it to be trusted. I confirmed
that I can connect to that location.

### Setting up a local admin user

See [here](https://magda.io/docs/how-to-create-local-users.html) for reference.

Git clone [the repo](https://github.com/magda-io/magda-auth-internal)

I did the equivalent of the following using k9s:

```bash
kubectl port-forward -n [namespace] combined-db-0 5432:5432
```

Then, using [this repo](https://github.com/magda-io/magda-auth-internal):

```bash
➜  magda git:(master) ✗ cd <path to>/magda-auth-internal
➜  magda-auth-internal git:(main) yarn install
yarn install v1.22.10
[1/4] 🔍  Resolving packages...
success Already up-to-date.
✨  Done in 0.26s.
➜  magda-auth-internal git:(main) yarn set-user-password --create edmund@blackadder.net -n "Edmund Blackadder" -a
yarn run v1.22.10
$ ./utils/set-user-password.js --create edmund@blackadder.net -n 'Edmund Blackadder' -a
Password for user (id: 394f02fc-51ba-4fdb-be46-4b700d3c6c16) has been set to: <some password>
✨  Done in 1.06s.
➜  magda-auth-internal git:(main) acs-cmd list users
╔══════════════════════════════════════╤═════════════════╤══════════════════════╤═══════════════════════════════════════╗
║ ID                                   │ Name            │ Org Unit             │ Roles                                 ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 00000000-0000-4000-8000-000000000000 │ admin           │                      │ 00000000-0000-0002-0000-000000000000: ║
║                                      │                 │                      │ Authenticated Users                   ║
║                                      │                 │                      │                                       ║
║                                      │                 │                      │ 00000000-0000-0003-0000-000000000000: ║
║                                      │                 │                      │ Admin Users                           ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 394f02fc-51ba-4fdb-be46-4b700d3c6c16 │ Edmund Blackadd │                      │ 00000000-0000-0002-0000-000000000000: ║
║                                      │ er              │                      │ Authenticated Users                   ║
╚══════════════════════════════════════╧═════════════════╧══════════════════════╧═══════════════════════════════════════╝

➜  magda-auth-internal git:(main) acs-cmd admin set 394f02fc-51ba-4fdb-be46-4b700d3c6c16
Operation Completed!
➜  magda-auth-internal git:(main) acs-cmd list users
╔══════════════════════════════════════╤═════════════════╤══════════════════════╤═══════════════════════════════════════╗
║ ID                                   │ Name            │ Org Unit             │ Roles                                 ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 00000000-0000-4000-8000-000000000000 │ admin           │                      │ 00000000-0000-0002-0000-000000000000: ║
║                                      │                 │                      │ Authenticated Users                   ║
║                                      │                 │                      │                                       ║
║                                      │                 │                      │ 00000000-0000-0003-0000-000000000000: ║
║                                      │                 │                      │ Admin Users                           ║
╟──────────────────────────────────────┼─────────────────┼──────────────────────┼───────────────────────────────────────╢
║ 394f02fc-51ba-4fdb-be46-4b700d3c6c16 │ Edmund Blackadd │                      │ 00000000-0000-0002-0000-000000000000: ║
║                                      │ er              │                      │ Authenticated Users                   ║
║                                      │                 │                      │                                       ║
║                                      │                 │                      │ 00000000-0000-0003-0000-000000000000: ║
║                                      │                 │                      │ Admin Users                           ║
╚══════════════════════════════════════╧═════════════════╧══════════════════════╧═══════════════════════════════════════╝


```

### Generate API keys for the user

From the Magda directory:

```bash
➜  magda git:(master) ✗ yarn create-api-key
yarn run v1.22.10
$ create-api-key
Usage: create-api-key [options]

A tool for creating API keys for a user. Version: 0.0.60-alpha.0
The database connection to auth DB is required, the following environment variables will be used to create a connection:
  POSTGRES_HOST: database host; If not available in env var, 'localhost' will be used.
  POSTGRES_DB: database name; If not available in env var, 'auth' will be used.
  POSTGRES_PORT: database port; If not available in env var, 5432 will be used.
  POSTGRES_USER: database username; If not available in env var, 'postgres' will be used.
  POSTGRES_PASSWORD: database password; If not available in env var, '' will be used.

Options:
  -V, --version           output the version number
  -u, --userId [User ID]  Specify the user id whose api key will be created.
  -c, --create            set this switch to create a new api key
  -l, --list              When -u switch presents, this switch will list all api keys (id & create time) of the user. Otherwise, all users will be listed.
  -h, --help              output usage information
✨  Done in 1.41s.
➜  magda git:(master) ✗ yarn create-api-key -c -u 394f02fc-51ba-4fdb-be46-4b700d3c6c16
yarn run v1.22.10
$ create-api-key -c -u 394f02fc-51ba-4fdb-be46-4b700d3c6c16
Successfully create a new API for user undefined:
   API key: <some key value here>
API key ID: <key id>
✨  Done in 0.55s.
➜  magda git:(master) ✗
```

## Some output

Here is my results of running that `create-secrets`:

```
magda-create-secrets tool version: 0.0.60-alpha.1
Found previous saved config (March 12th 2021, 9:06:57 am).
? Do you want to connect to kubernetes cluster to create secrets without going through any questions? NO (Going through
all questions)
? Are you creating k8s secrets for google cloud or local testing cluster? Local Testing Kubernetes Cluster
? Which local k8s cluster environment you are going to connect to? minikube
? Do you need to access SMTP service for sending data request email? NO
? Do you want to create google-client-secret for oAuth SSO? NO
? Do you want to create facebook-client-secret for oAuth SSO? NO
? Do you want to create arcgis-client-secret for oAuth SSO? NO
? Do you want to create aaf-client-secret for AAF Rapid Connect SSO? NO
? Do you want to setup HTTP Basic authentication? NO
? Do you want to manually input the password used for databases? Generated password: <some password string>
? Please enter an access key for your MinIO server: minio
? Please enter a secret key for your MinIO server:: miniominio
? Specify a namespace or leave blank and override by env variable later? NO (leave blank and override by env variable la
ter)
? Do you want to allow environment variables (see --help for full list) to override current settings at runtime? YES (An
y environment variable can overide my settings)
? Do you want to connect to kubernetes cluster to create secrets now? YES (Create Secrets in Cluster now)
Failed to get k8s namespace magda or namespace has not been created yet: Error: Command failed: kubectl get namespace magda
? Do you want to create namespace `magda` now? YES
namespace/magda created
Successfully created secret `db-passwords` in namespace `magda`.
Successfully created secret `storage-secrets` in namespace `magda`.
Successfully created secret `auth-secrets` in namespace `magda`.
All required secrets have been successfully created!
```

## Ingress.yaml

```yaml
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
    name: local-ingress
    annotations:
        cert-manager.io/cluster-issuer: selfsigned-issuer
        # optional allow max file upload size 100M
        nginx.ingress.kubernetes.io/client-body-buffer-size: 100M
        nginx.ingress.kubernetes.io/proxy-body-size: 100M
spec:
    rules:
        - host: minikube.local
          http:
              paths:
                  - path: /
                    backend:
                        serviceName: gateway
                        servicePort: 80
    tls:
        - hosts:
              - minikube.local
          secretName: magda-local-cert-tls
```
