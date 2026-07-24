# Deploy Magda to AWS

### 1> Create EKS cluster on AWS using `eksctl`

Amazon Elastic Kubernetes Service (Amazon EKS) is a managed service that you can use to run Kubernetes on AWS without needing to install, operate, and maintain your own Kubernetes control plane or nodes.

`eksctl` is a simple CLI tool for creating clusters on EKS - Amazon's new managed Kubernetes service for EC2. It is written in Go, and uses CloudFormation.

You can follow the AWS tutorial document below to create an EKS cluster using `eksctl`:

https://docs.aws.amazon.com/eks/latest/userguide/getting-started-eksctl.html

More usage info of `eksctl` can be found from: https://eksctl.io/

### 2> Create a kubeconfig for Amazon EKS

> You need to setup kubeconfig so you can use [kubectl](https://kubernetes.io/docs/tasks/tools/) connect to / manage your cluster or use [helm](https://helm.sh/) to install Magda

```bash
aws eks --region <region-code> update-kubeconfig --name <cluster_name>
```

More details can be found from: https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html

### 3> Create AWS PostgreSQL Database (Optional)

> You can also choose to use the in-pod PostgreSQL database that comes with Magda helm charts. But for production deployment, it's recommended to use a cloud provider hosted database, i.e. create an AWS RDS PostgreSQL database.

> Magda supports PostgreSQL 13 - 17. RDS uses `scram-sha-256` password encryption by default (PostgreSQL 14+), which is fully supported by the DB migrator. You can name the master user account anything you like (e.g. `magda_admin`) — you no longer need to name it `postgres`. Whatever name you choose, set `global.postgresql.postgresqlUsername` to it at install time (see step 7); the chart will otherwise fail fast to stop you from accidentally using the wrong privileged account.

To make EKS cluster be able to connect to the RDS database created, you need to make sure the followings are in place:

- EKS cluster with its own VPC
- RDS (Postgres) with its own VPC
- Create a Peering connection initiated from the EKS VPC (Requester VPC) to the RDS VPC (Accepter VPC)
  - Make sure RDS VPC security group inbound rules allow TCP requests (port 5432) from EKS VPC subnet.
- Enable "dns propagation" in the peering connection. i.e.
  - Enable `DNS resolution from accepter VPC to private IP`
  - Enable `DNS resolution from requester VPC to private IP`

> You can use RDS Endpoint domain e.g. `xxxx.xxx.[region name].rds.amazonaws.com` to connect to the RDS from your EKS cluster.

### 4> Install kubernetes-replicator

> It’s only required by the OpenFaas part of Magda which can be turned off via [global.openfaas.enabled](https://github.com/magda-io/magda/tree/master/deploy/helm/magda).

```bash
# add helm chart repo
helm repo add mittwald https://helm.mittwald.de

# update helm chart repo
helm repo update

# create namespace `kubernetes-replicator`
kubectl create namespace kubernetes-replicator

# Install kubernetes-replicator via helm
helm upgrade --namespace kubernetes-replicator --install kubernetes-replicator mittwald/kubernetes-replicator
```

### 5> Create a namespace "magda" for your Magda installation

```bash
kubectl create namespace magda
```

### 6> Create required secrets in Magda deployment namespace `magda`

> Please note: since Magda v1.0.0, Magda's helm chart can auto-generate internal secrets for core modules. You don't have to manually generate secrets unless it's external key / secret that is supplied by external providers. e.g. smtp username & password or authentication plugin credentials (if you use any)

Magda auto-generates all of its internal secrets by default — the auth/session secrets (`auth-secrets`), the object storage credentials (`storage-secrets`), and the restricted (`client`) DB account secret. You therefore only need to supply secrets that come from outside the cluster:

- **The privileged (master) DB account password** — required when using an external database (RDS / Cloud SQL), because Magda only auto-generates this for the in-pod PostgreSQL database. The DB migrator connects as `global.postgresql.postgresqlUsername` (see step 7) with this password.
- **SMTP credentials** — only if you enable outbound email (`correspondence-api`).

```bash
# The master (privileged) user account password of your external RDS database.
# This is the ONLY secret you must supply manually for a standard external-DB deployment.
export DB_MASTER_PASSWORD="Your Master DB Password"

kubectl create secret generic db-main-account-secret --namespace magda \
--from-literal=postgresql-password=$DB_MASTER_PASSWORD

# Optional: only needed if you enable outbound email (correspondence-api).
# kubectl create secret generic smtp-secret --namespace magda \
# --from-literal=username="Your SMTP USERNAME" --from-literal=password="Your SMTP PASSWORD"
```

> You do not need to create the `auth-secrets`, `storage-secrets`, or the per-service `db-passwords` secrets manually — the chart generates them (and the DB migrator creates the restricted `client` DB account for you). You only supply the privileged (master) DB password above.

> If you use [authentication plugins](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md), you might need to create extra secrets as required.

### 7> Install Magda via Helm

```bash
helm upgrade --namespace magda --install --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda oci://ghcr.io/magda-io/charts/magda
```

> Since v2, we release our helm charts to Github container registry: `oci://ghcr.io/magda-io/charts`

> By default, it will use in pod postgresSQL database. To use RDS, you need to set extra values as blow:

```bash
# Set RDS endpoint domain
export RDS_ENDPOINT=xxxx.xxx.[region name].rds.amazonaws.com
# Set the master (privileged) user name you created on the RDS instance (see step 3)
export DB_MASTER_USER=magda_admin

helm upgrade --namespace magda --install --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer,global.useCombinedDb=false,global.useCloudSql=false,global.useAwsRdsDb=true,global.awsRdsEndpoint=$RDS_ENDPOINT,global.postgresql.postgresqlUsername=$DB_MASTER_USER magda oci://ghcr.io/magda-io/charts/magda
```

> `global.postgresql.postgresqlUsername` is required when `global.useAwsRdsDb=true`. It must match the RDS master user you created and whose password you stored in the `db-main-account-secret` secret (step 6). If it is left as the default `postgres` the chart will fail to render, unless your privileged account is genuinely named `postgres`, in which case set `global.postgresql.allowDefaultExternalDbPostgresUser=true`.

> By default, Helm will install the latest production version of Magda. You can use `--version` to specify the exact chart version to use. e.g.:

```bash
helm upgrade --namespace magda --install --version 6.1.1 --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda oci://ghcr.io/magda-io/charts/magda
```

The value `--set magda-core.gateway.service.type=LoadBalancer` will expose Magda via load balancer (AWS ELB).

You can run:

```bash
echo $(kubectl get svc --namespace magda gateway --template "{{ range (index .status.loadBalancer.ingress 0) }}{{ . }}{{ end }}")
```

to find out the load balancer external IP. And access Magda via http://[External IP].

> To expose Magda via Ingress and Setup TLS / SSL, you can follow [this docs](https://docs.microsoft.com/en-us/azure/aks/ingress-tls)
