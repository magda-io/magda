MAGDA can be run in two main ways:

* Kubernetes - Each component is built into a Docker container and run on a Kubernetes cluster, which may be a robust production environment or a simple local cluster like Minikube.  This is good for production environments and for testing in a more production-like environment on your development machine.  It also creates a more consistent environment, potentially avoiding configuration quirks of your development machine.
* Host - The components are run in JVM processes running directly on your development machine.  This allows for fast development cycles because a code change can quickly trigger a restart of the JVM running that component. 

## Kubernetes (local, minikube)

Running on a local Kubernetes cluster involves these steps:

1. Set up your cluster.  On a development system, this means installing minikube and kubectl.
2. Deploy the kube registry to the cluster.

```bash
kubectl create -f deploy/kubernetes/registry.yml
```

3. Compile the components, create their Docker images, and push them to the local registry.  This will also terminate the running pods associated with the components, triggering them to restart with the new image.

```bash
sbt deployLocal
```

4. Deploy to the cluster
 
```bash
cd deploy/kubernetes
kubectl create -f elasticsearch.yml -f registry-datastore.yml -f local.yml
```

At this point, the services will be running on your Minikube IP address.  Use `minikube docker-env` and take a look at the IP address listed under `DOCKER_HOST`.  The port of each service will be the `nodePort` listed in `local.yml`.

In development, it may be helpful to run:

```bash
sbt ~deployLocalOnChange
```

This will automatically re-run `deployLocal` for a component each time a source file used by that component changes. 

## Host

Running the JVM-based components directly on your development machine is easy.  However, a working MAGDA system also needs these components:

1. PostgreSQL - Used for persistence of the data registry.
2. Elasticsearch - Used to index datasets for searching.
 
The easiest way to run these two databases on your development machine is to use minikube!
 
```bash
cd deploy/kubernetes
kubectl create -f elasticsearch.yml -f registry-datastore.yml
```

Then, to make PostgreSQL accessible on port 5432 on your development machine, run:

```bash
kubectl port-forward $(kubectl get pods -l service=registry-datastore -o=custom-columns=NAME:.metadata.name --no-headers) 5432
```

Note that if you want to use a different hostname or port for the database, you will need to change `db.default.url` in `registry-api/src/main/resources/env-specific-config/host.conf` accordingly.

You may also run PostgreSQL locally on your development machine instead of in Kubernetes.  If you go this route, be sure to run `registry-data-store/scripts/init/evolveschema.sql` on your local PostgreSQL instance to set up the database.

TODO: what do we need to do to get Elasticsearch running?

Once the databases are out of the way, we set the environment variable indicating that we will be running directly on our development machine:

```bash
export SCALA_ENV=host
```

Then we can build and run using sbt.  It's helpful to start an interactive `sbt` sessions and run these commands as necessary.

* `~relaunch` - Compile (if necessary) and launch a JVM process for each component.  When a source file changes, affected components will be built and relaunched automatically.
* `registryApi/reStart` - Compile (if necessary) and restart a specific component (registryApi in this case).
* `reStatus` - Tells you which components are running.  It is normal for `root` and `common` to not be running, since they are not executable.

