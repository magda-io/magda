## Prerequisites

You need the following in order to build and run MAGDA:

* [Node.js](https://nodejs.org/en/) - To build and run the TypeScript / JavaScript components, as well as many of the build scripts.  Please install version 6, as version 8 includes npm 5 which currently doesn't work well with lerna.
* [Java 8 JDK](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html) - To run the JVM components, and to build the small amount of Java code.
* [sbt](http://www.scala-sbt.org/) - To build the Scala components.
* [lerna](https://lernajs.io/) - To manage our multiple-project repo.  Once you have Node.js installed, installing lerna is as simple as `npm install -g lerna`.
* [Minikube](https://github.com/kubernetes/minikube) - To run a Kubernetes cluster on your local development machine.  It is possible to run all of the Magda microservices directly on your local machine instead of on a Kubernetes cluster, in which case you don't, strictly speaking, need Minikube.  However, you will probably want to run at least some of the services, such as the databases, on a cluster for ease of setup.
* [gcloud](https://cloud.google.com/sdk/gcloud/) - For the `kubectl` tool used to control your Kubernetes cluster.  You will also need to this to deploy to our test and production environment on Google Cloud.

These instructions assume you are using a Bash shell.  You can easily get a Bash shell on Windows by installing the [git](https://git-scm.com/downloads) client.

## Setting up Minikube

As mentioned above, Minikube is optional.  However, you will probably find it easier to run at least the databases (PostgreSQL and ElasticSearch) on Minikube, rather than installing them on your development machine.

After you [install Minikube](https://github.com/kubernetes/minikube/releases), start it with:

```bash
minikube config set memory 4096
minikube start
```

This reserves 4 GB of RAM for Minikube and starts it up.  If you're low on RAM and only intend to run the databases on Minikube, you can likely get away with a smaller number, like 2048.

More detailed instructions for setting up Minikube can be found [here](https://github.com/kubernetes/minikube) if that doesn't work.

To set up the environment variables necessary for Docker to interact with the Minikube VM, run:

```bash
eval $(minikube docker-env)
```

You'll need to run this in each new shell.

Finally, deploy the kube registry to the Minikube cluster:

```bash
kubectl create -f deploy/kubernetes/local/kube-registry.yml
```

## Building and running components

Once the above prerequisites are in place, building MAGDA is easy.  From the MAGDA root directory, simply run:

```bash
npm run build
```

You can also run the same command in an individual component's directory (i.e. `magda-whatever/`) to build just that component.

To run a built component, run:

```bash
npm start
```

## Running on your local machine

For a quick development cycle on any component, run:

```bash
npm run dev
```

This will build and launch the component, and automatically stop, build, and restart it whenever source changes are detected.  In some cases (e.g. code generation), it is necessary to run `npm run build` at least once before `npm run dev` will work.  Typically it is _not_ necessary to run `npm run build` again in the course of development, though, unless you're changing something other than source code.

This even works in `magda-combined-db` and `magda-elastic-search`, so you can start up the database (on Minikube), the registry API, and a connector by executing the following three commands in three separate windows:

```bash
# these three commands don't terminate, so run them in separate terminals
cd magda-combined-db && npm run dev
cd magda-registry-api && npm run dev
cd magda-ckan-connector && npm run dev -- --config ../deploy/connector-config/data-gov-au.json
```

If you get an error like `error: unable to forward port because pod is not running. Current status=Pending` when running `npm run dev` in the database directories, it means the database pod has not yet started up on Minikube.  Wait a couple of seconds and try again.

## But what do I need to run?

Running individual components is easy enough, but how do I get a fully working system?  It is rarely necessary to run _all_ of MAGDA, but various components depend on other components as follows:

| Component | Dependencies |
| magda-registry-api | magda-combined-db |
| magda-indexer | magda-elastic-search |
| magda-search-pi | magda-elastic-search |
| magda-*-connector | magda-registry-api |
| magda-*-sleuther | magda-registry-api |

# Older stuff below, use at your own risk

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
