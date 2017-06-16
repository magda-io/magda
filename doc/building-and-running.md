MAGDA can be run in two main ways:

* Kubernetes - Each component is built into a Docker container and run on a Kubernetes cluster, which may be a robust production environment or a simple local cluster like Minikube.  This is good for production environments and for testing in a more production-like environment on your development machine.  It also creates a more consistent environment, potentially avoiding configuration quirks of your development machine.
* Host - The components are run in JVM processes running directly on your development machine.  This allows for fast development cycles because a code change can quickly trigger a restart of the JVM running that component. 

Even when running the components on the host, it may be helpful to run the databases on a local Kubernetes cluster to save the hassle of installing them on your development machine.

## Set up Minikube

First, install [Minikube](https://github.com/kubernetes/minikube/releases) and [kubectl](https://kubernetes.io/docs/user-guide/prereqs/) and put both in your path.

You'll also need some kind of virtual machine software installed.

Start your Minikube VM with:

```bash
minikube config set memory 4096
minikube start
```

More detailed instructions for setting up Minikube can be found [here](https://github.com/kubernetes/minikube) if that doesn't work.

To set up the environment variables necessary for Docker to interact with the Minikube VM, run:

```bash
eval $(minikube docker-env)
```

You'll need to run this in each new shell.

Finally, deploy the kube registry to the Minikube cluster:

```bash
kubectl create -f deploy/kubernetes/local/base/kube-registry.yml
```

## Set up the databases

MAGDA currently uses the following databases:

1. PostgreSQL - Used for persistence of the data registry.
2. Elasticsearch - Used to index datasets for searching.

The easiest way to run these databases is with Minikube.

First, build and push the Docker containers:

```bash
docker build -t localhost:5000/data61/elasticsearch-kubernetes:latest -f deploy/docker/elasticsearch-kubernetes.dockerfile deploy/docker
docker push localhost:5000/data61/elasticsearch-kubernetes:latest

docker build -t localhost:5000/data61/magda-registry-datastore:latest magda-registry-datastore
docker push localhost:5000/data61/magda-registry-datastore:latest
```

Then, start them up on the cluster with:

```bash
cd deploy/kubernetes
kubectl create -f elasticsearch.yml -f magda-registry-datastore.yml
```

## Run MAGDA on a Kubernetes cluster

To run MAGDA itself on a Kubernetes cluster, follow these steps.

* [Set up Minikube](#set-up-minikube) and [Set up the databases](#set-up-the-databases).
* Compile the components, create their Docker images, and push them to the kube registry.  This will also terminate the running pods associated with the components, triggering them to restart with the new image.

```bash
sbt deployLocal
```

* Deploy to the cluster
 
```bash
cd deploy/kubernetes
kubectl create -f local.yml
```

At this point, the services will be running on your Minikube IP address.  Use `minikube ip` to get the IP address.  The port of each service will be the `nodePort` listed in `local.yml`.

In development, it may be helpful to run:

```bash
sbt ~deployLocalOnChange
```

This will automatically re-run `deployLocal` for a component each time a source file used by that component changes. 

The CKAN Connector currently assumes the registry running on http://localhost:6100.  But when running on a Kubernetes cluster, it will be on the Kubernetes node's port 30010.  You can bridge this gap by port forwarding:

```bash
kubectl port-forward $(kubectl get pods -l service=registry-api -o=custom-columns=NAME:.metadata.name --no-headers) 6100:80 > /dev/null &
```

## Host

To run MAGDA itself directly on your development machine, follow these steps.

* [Set up Minikube](#set-up-minikube) and [Set up the databases](#set-up-the-databases).
* Make the Minikube PostgreSQL and Elasticsearch instances accessible on a port on your development machine by running:

```bash
kubectl port-forward $(kubectl get pods -l service=registry-datastore -o=custom-columns=NAME:.metadata.name --no-headers) 5432 > /dev/null &
kubectl port-forward $(kubectl get pods -l component=elasticsearch -o=custom-columns=NAME:.metadata.name --no-headers) 9300 > /dev/null &
```

Note that if you want to use a different hostname or port for the database, you will need to change `db.default.url` in `magda-registry-api/src/main/resources/env-specific-config/host.conf` accordingly.

* Set the environment variable indicating that we will be running directly on our development machine:

```bash
export SCALA_ENV=host
```

* Build and run using sbt.  It's helpful to start an interactive `sbt` session and run these commands as necessary.
  * `~relaunch` - Compile (if necessary) and launch a JVM process for each component.  When a source file changes, affected components will be built and relaunched automatically.
  * `registryApi/reStart` - Compile (if necessary) and restart a specific component (registryApi in this case).
  * `reStatus` - Tells you which components are running.  It is normal for `root` and `magda-scala-common` to not be running, since they are not executable.
