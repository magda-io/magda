# Deploy Magda to Microsoft Azure

1> Install the Azure CLI

If you haven't, follow the link below to install the Azure CLI.

https://docs.microsoft.com/en-us/cli/azure/install-azure-cli

2> In Azure Portal, create a [Resource Group](https://docs.microsoft.com/en-us/azure/azure-resource-manager/management/overview) with a name you preferred. e.g. `magda-deploy-res-group`.

> A `Resource Group` is a container that holds related resources for an Azure solution.

3> Go the resource group created, click "Add" button to add "Kubernetes Service". If it is not already on the screen, you can find it from search input by key in "Kubernetes Service". See screenshot below:

![Azure Create k8s service](./azure/create-k8s-service.png)

4> Open the "Kubernetes Service" resource that is just created (see screenshot below).

And click the "Connect" button to get the commands required to connect to your cluster and setup the k8s config for your local kubectl tool.

![Connect to Your AKS cluster](./azure/connect-to-cluster.png)

5> Install kubernetes-replicator

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

6> Create a namespace "magda" for your Magda installation

```bash
kubectl create namespace magda
```

7> Create required secrets

> You need [pwgen](https://linux.die.net/man/1/pwgen) command line tool to follow the instruction below. If it's not availble on nyour system, you need to install one.

```bash
export JWT_SECRET="$(pwgen 32 1)"
export SESSION_SECRET="$(pwgen 32 1)"
export DB_PASSWORD="$(pwgen 32 1)"
export MINIO_ACCESS_KEY="$(pwgen 32 1)"
export MINIO_SECRET_KEY="$(pwgen 32 1)"

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

# Optional; Only for sending email notification of user inquires
kubectl create secret generic smtp-secret --namespace magda --from-literal=username=$SMTP_USERNAME --from-literal=password=$SMTP_PASSWORD
```

> **Using an external Azure Database for PostgreSQL (Flexible Server)? Grant your admin account rights on the `public` schema (PostgreSQL 15+).**
>
> The steps above install Magda with its bundled in-cluster PostgreSQL. If you
> instead point Magda at a managed **Azure Database for PostgreSQL — Flexible
> Server** (recommended for production), be aware of a PostgreSQL 15 change that
> commonly trips up first-time deployments.
>
> In PostgreSQL 14 and earlier, every role automatically had `CREATE` permission
> on the `public` schema of every database — it was effectively world-writable,
> so any account that could connect could create tables. PostgreSQL 15 **removed
> that default** and made `public` owned by the database's owner; from 15 onward
> only the schema owner, or a role explicitly granted `CREATE ON SCHEMA public`,
> may create objects there (see the
> [PostgreSQL 15 release notes](https://www.postgresql.org/docs/release/15.0/),
> "Remove PUBLIC creation permission on the public schema"). Azure Database for
> PostgreSQL Flexible Server runs PostgreSQL 15 or newer, and — unlike some
> providers — the administrator login it gives you is a member of
> `azure_pg_admin` but is **not** a superuser and does **not** own the built-in
> `postgres` database's `public` schema, so on Azure this grant is usually
> **required**, not optional.
>
> Magda's `registry-db` migrator creates the registry's tables in the `public`
> schema of the server's **default `postgres` database** (the registry service
> connects without naming a specific database), using the admin account you set
> as `global.postgresql.auth.username`. If that account cannot create in that
> `public` schema, the migrator will **connect successfully** (both TLS and
> password authentication pass) and then fail part-way through with:
>
> ```
> ERROR: permission denied for schema public
> ```
>
> Because this happens right after a fully established (and, with `verify-ca` /
> `verify-full`, certificate-verified) connection, it is easy to misread as an
> SSL / CA problem — but it is purely the PostgreSQL 15 schema-privilege change,
> unrelated to TLS. Fix it once, connected to the target database as the admin
> login, with **one** of:
>
> ```sql
> -- Preferred: let the admin own the schema, so it can also grant the
> -- non-privileged "client" role the access Magda's migrations set up.
> ALTER SCHEMA public OWNER TO magda_admin;   -- magda_admin = your admin login
>
> -- Or, to leave ownership unchanged but still allow object creation:
> GRANT CREATE ON SCHEMA public TO magda_admin;
> ```

8> Install Magda via Helm

```bash
helm upgrade --namespace magda --install --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda oci://ghcr.io/magda-io/charts/magda
```

> Since v2, we release our helm charts to Github container registry: `oci://ghcr.io/magda-io/charts`

> By default, Helm will install the latest production version of Magda. You can use `--version` to specify the exact chart version to use. e.g.:

```bash
helm upgrade --namespace magda --install --version 0.0.60-rc.1 --timeout 9999s --set magda-core.gateway.service.type=LoadBalancer magda oci://ghcr.io/magda-io/charts/magda
```

The value `--set magda-core.gateway.service.type=LoadBalancer` will expose Magda via load balancer.

You can run:

```bash
echo $(kubectl get svc --namespace magda gateway --template "{{ range (index .status.loadBalancer.ingress 0) }}{{ . }}{{ end }}")
```

to find out the load balancer external IP. And access Magda via http://[External IP].

> To expose Magda via Ingress and Setup TLS / SSL, you can follow [this docs](https://docs.microsoft.com/en-us/azure/aks/ingress-tls)
