# Deploy Magda to AWS

### 1> Create EKS cluster on AWS using `eksctl`

Amazon Elastic Kubernetes Service (Amazon EKS) is a managed service that you can use to run Kubernetes on AWS without needing to install, operate, and maintain your own Kubernetes control plane or nodes.

`eksctl` is a simple CLI tool for creating clusters on EKS - Amazon's new managed Kubernetes service for EC2. It is written in Go, and uses CloudFormation.

You can follow the AWS tutorial document below to create an EKS cluster using `eksctl`:

https://docs.aws.amazon.com/eks/latest/userguide/getting-started-eksctl.html

More usage info of `eksctk` can be found from: https://eksctl.io/

### 2> Create a kubeconfig for Amazon EKS

> You need to setup kubeconfig so you can use [kubectl](https://kubernetes.io/docs/tasks/tools/) connect to / manage your cluster or use [helm](https://helm.sh/) to install Magda

```bash
aws eks --region <region-code> update-kubeconfig --name <cluster_name>
```

More details can be found from: https://docs.aws.amazon.com/eks/latest/userguide/create-kubeconfig.html

### 3> Create AWS PostgreSQL Database (Optional)

> You can also choose to use the in-pod PostgreSQL database that comes with Magda helm charts. But for production deployment, it's recommanded to use cloud provider hosted database i.e. Create AWS PostgreSQL Database

> Please note: you need to create master db user in name "postgres" due to [this issue](https://github.com/magda-io/magda/issues/3126).

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

> You need [pwgen](https://linux.die.net/man/1/pwgen) command line tool to follow the instruction below. If it's not availble on nyour system, you need to install one.

```bash
export JWT_SECRET="$(pwgen 32 1)"
export SESSION_SECRET="$(pwgen 32 1)"
# this is the password for a DB account auto created by Magda using master DB account
export DB_PASSWORD="$(pwgen 32 1)"
export MINIO_ACCESS_KEY="$(pwgen 32 1)"
export MINIO_SECRET_KEY="$(pwgen 32 1)"

# This is your DB master user account password
export DB_MASTER_PASSWORD="Your Master DB PASSWORD"
# for sending inquiry emails
export SMTP_USERNAME="Your SMTP USERNAME"
export SMTP_PASSWORD="Your SMTP PASSWORD"


kubectl create secret generic cloudsql-db-credentials --namespace magda --from-literal=password=$DB_MASTER_PASSWORD

kubectl create secret generic auth-secrets --namespace magda --from-literal=jwt-secret=$JWT_SECRET --from-literal=session-secret=$SESSION_SECRET

kubectl --namespace magda annotate --overwrite secret auth-secrets replicator.v1.mittwald.de/replication-allowed=true replicator.v1.mittwald.de/replication-allowed-namespaces=magda-openfaas-fn

kubectl create secret generic db-passwords --namespace magda \
--from-literal=combined-db=$DB_PASSWORD \
--from-literal=authorization-db=$DB_PASSWORD \
--from-literal=content-db=$DB_PASSWORD \
--from-literal=session-db=$DB_PASSWORD  \
--from-literal=registry-db=$DB_PASSWORD \
--from-literal=combined-db-client=$DB_PASSWORD \
--from-literal=authorization-db-client=$DB_PASSWORD \
--from-literal=content-db-client=$DB_PASSWORD \
--from-literal=session-db-client=$DB_PASSWORD \
--from-literal=registry-db-client=$DB_PASSWORD \
--from-literal=tenant-db=$DB_PASSWORD \
--from-literal=tenant-db-client=$DB_PASSWORD

kubectl create secret generic storage-secrets --namespace magda --from-literal=accesskey=$MINIO_ACCESS_KEY --from-literal=secretkey=$MINIO_SECRET_KEY

kubectl create secret generic smtp-secret --namespace magda --from-literal=username=$SMTP_USERNAME --from-literal=password=$SMTP_PASSWORD
```

> If you use [authentication plugins](https://github.com/magda-io/magda/blob/master/docs/docs/authentication-plugin-spec.md), you might need to create extra secrets as required.

### 7> Add Magda Helm Repo

```bash
helm repo add magda-io https://charts.magda.io
helm repo update
```

### 8> Install Magda via Helm

```bash
helm upgrade --namespace magda --install --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda magda-io/magda
```

> By default, it will use in pod postgresSQL database. To use RDS, you need to set extra values as blow:

```bash
# Set RDS endpoint domain
export RDS_ENDPOINT=xxxx.xxx.[region name].rds.amazonaws.com

helm upgrade --namespace magda --install --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer,global.useCombinedDb=false,global.useCloudSql=false,global.useAwsRdsDb=true,global.awsRdsEndpoint=$RDS_ENDPOINT magda magda-io/magda
```

> By default, Helm will install the latest production version of Magda. You can use `--version` to specify the exact chart version to use. e.g.:

```bash
helm upgrade --namespace magda --install --version 0.0.60-rc.1 --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda magda-io/magda
```

The value `--set magda-core.gateway.service.type=LoadBalancer` will expose Magda via load balancer (AWS ELB).

You can run:

```bash
echo $(kubectl get svc --namespace magda gateway --template "{{ range (index .status.loadBalancer.ingress 0) }}{{ . }}{{ end }}")
```

to find out the load balancer external IP. And access Magda via http://[External IP].

> To expose Magda via Ingress and Setup TLS / SSL, you can follow [this docs](https://docs.microsoft.com/en-us/azure/aks/ingress-tls)
