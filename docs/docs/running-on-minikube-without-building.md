# Running Magda on Minikube (published chart, no build required)

This guide sets up a local Magda instance on [minikube](https://minikube.sigs.k8s.io/) using the **published Helm chart** — you don't need to clone the repository or build any Docker images. It's aimed at evaluating Magda or trying it out locally.

> Setting up a developer/debug environment (building images, deploying the chart from a source checkout) is a different, heavier workflow. For thorough end-to-end verification of a release, see the [End-to-End Full Cluster Deployment Test](./e2e-cluster-deployment-test.md), which is written for contributors.

Magda is installed into its own `magda` namespace throughout.

## Prerequisites

Install these (via Homebrew or your package manager of choice):

1. [Docker](https://www.docker.com/products/docker-desktop) — used as the minikube driver
2. [minikube](https://minikube.sigs.k8s.io/docs/start/)
3. [kubectl](https://kubernetes.io/docs/tasks/tools/)
4. [helm](https://helm.sh/) (v3)

Optional, but handy for watching pods start up:

- [k9s](https://github.com/derailed/k9s)

## Step 1: Start minikube

A default Magda install runs the full stack (search, semantic search, embedding API, PDF/CSV indexers, PostgreSQL, MinIO and OpenSearch) — around two dozen pods. Give the cluster enough resources:

```bash
minikube start --driver=docker --memory=16384 --cpus=4 --disk-size=60g
```

> Minimum is roughly 8 GB memory / 2 CPUs, but the full stack is happier with more. On a constrained machine, see the chart's `values.yaml` for how to disable optional components (for example, the semantic-search stack).

## Step 2: Install the published chart

```bash
kubectl create namespace magda
helm install magda oci://ghcr.io/magda-io/charts/magda --version <VERSION> -n magda
```

Replace `<VERSION>` with the release you want — see the [latest release](https://github.com/magda-io/magda/releases) (for example, `6.1.1`). Installing with default values deploys the full stack.

> Since v2, Magda's Helm charts are published to the GitHub Container Registry: `oci://ghcr.io/magda-io/charts`.

## Step 3: Wait for the pods to be ready

```bash
kubectl get pods -n magda -w
```

The full install brings up ~24 pods and can take several minutes on first run (image pulls, database migrations, OpenSearch cluster formation). A few early restarts on the `indexer` and semantic-indexer pods are normal — they retry until OpenSearch is accepting connections. Once things settle, nothing should remain outside `Running`/`Completed`:

```bash
kubectl get pods -n magda --no-headers | grep -vE "Running|Completed"
# should print nothing
```

## Step 4: Access Magda in your browser

The lowest-friction way to reach the local instance is to port-forward the gateway (which fronts the whole platform):

```bash
kubectl port-forward -n magda svc/gateway 8080:80
```

Then open <http://localhost:8080> in your browser. You can search and browse the catalogue straight away — no `sudo`, LoadBalancer or DNS setup required.

## Next steps

- **Create a local admin user:** [How to create local users](./how-to-create-local-users.md), then [set a user as admin](./how-to-set-user-as-admin-user.md).
- **Generate an API key** (for example, to use with `mgd` or the REST API): [How to create an API key](./how-to-create-api-key.md).
- **Enable HTTPS access** to the local cluster (needed for some login flows): [How to set up HTTPS to a local cluster](./how-to-setup-https-to-local-cluster.md).
- **Use the `mgd` CLI** against your instance or the public demo catalogue: [`mgd` guide](https://github.com/magda-io/magda/blob/main/packages/mgd/README.md).

## Cleaning up

```bash
# remove Magda but keep the cluster
helm uninstall magda -n magda
kubectl delete namespace magda

# or remove the whole minikube cluster
minikube delete
```
