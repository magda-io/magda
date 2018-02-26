## Prerequisites

You need the following in order to build and run MAGDA:

* [Node.js](https://nodejs.org/en/) - To build and run the TypeScript / JavaScript components, as well as many of the build scripts. Please install version 6, as version 8 includes npm 5 which currently doesn't work well with lerna.
* [Java 8 JDK](http://www.oracle.com/technetwork/java/javase/downloads/jdk8-downloads-2133151.html) - To run the JVM components, and to build the small amount of Java code.
* [sbt](http://www.scala-sbt.org/) - To build the Scala components.
* [lerna](https://lernajs.io/) - To manage our multiple-project repo. Once you have Node.js installed, installing lerna is as simple as `npm install -g lerna`.
* [Minikube](https://github.com/kubernetes/minikube) - To run a Kubernetes cluster on your local development machine. It is possible to run all of the Magda microservices directly on your local machine instead of on a Kubernetes cluster, in which case you don't, strictly speaking, need Minikube. However, you will probably want to run at least some of the services, such as the databases, on a cluster for ease of setup.
* [gcloud](https://cloud.google.com/sdk/gcloud/) - For the `kubectl` tool used to control your Kubernetes cluster. You will also need to this to deploy to our test and production environment on Google Cloud.
* [GNU tar](https://www.gnu.org/software/tar/) - MacOS ships with `BSD tar`. However, you will need `GNU tar` for docker images operations. On MacOS, you can install `GNU Tar` via [Homebrew](https://brew.sh/): `brew install gnu-tar`
* [Docker](https://docs.docker.com/install/) - Magda uses `docker` command line tool to build docker images.

These instructions assume you are using a Bash shell. You can easily get a Bash shell on Windows by installing the [git](https://git-scm.com/downloads) client.

## Building and running components

First, install `npm` dependencies and set up the links between components by running:

```bash
lerna bootstrap
```

Once the above prerequisites are in place, and the npm dependencies are installed, building MAGDA is easy. From the MAGDA root directory, simply run:

```bash
npm run build
```

You can also run the same command in an individual component's directory (i.e. `magda-whatever/`) to build just that component.

To run a built component, run the following in a component directory:

```bash
npm start
```

## Setting up Minikube

As mentioned above, Minikube is optional. However, you will probably find it easier to run at least the databases (PostgreSQL and ElasticSearch) on Minikube, rather than installing them on your development machine.

After you [install Minikube](https://github.com/kubernetes/minikube/releases), start it with:

```bash
minikube config set memory 4096
minikube start
```

This reserves 4 GB of RAM for Minikube and starts it up. If you're low on RAM and only intend to run the databases on Minikube, you can likely get away with a smaller number, like 2048.

More detailed instructions for setting up Minikube can be found [here](https://github.com/kubernetes/minikube) if that doesn't work.

To set up the environment variables necessary for Docker to interact with the Minikube VM, run:

```bash
eval $(minikube docker-env)
```

You'll need to run this in each new shell.

### Setting up Helm

Helm is the package manager for Kubernetes - we use it to make it so that you can install all the various services you need for MAGDA at once. To install, follow the instructions at https://github.com/kubernetes/helm/blob/master/docs/install.md.

In a nutshell, once you have helm installed, this is how you initialise helm and Tiller.

```bash
helm init
```

### Install a local kube registry

This gives you a local docker registry that you'll upload your built images to so you can use them locally, without having to go via DockerHub or some other external registry.

```bash
helm repo add incubator http://storage.googleapis.com/kubernetes-charts-incubator
helm repo update
helm install --name docker-registry -f deploy/helm/docker-registry.yml stable/docker-registry
helm install --name kube-registry-proxy -f deploy/helm/kube-registry-proxy.yml incubator/kube-registry-proxy
```

### Crawl Data

```bash
cd deploy
npm run create-connector-configmap
npm run generate-connector-jobs-local
kubectl create -f kubernetes/generated/local/
```

## Running on your local machine

For a quick development cycle on any component (except `combined-db` and `elastic-search`), run:

```bash
npm run dev
```

This will build and launch the component, and automatically stop, build, and restart it whenever source changes are detected. In some cases (e.g. code generation), it is necessary to run `npm run build` at least once before `npm run dev` will work. Typically it is _not_ necessary to run `npm run build` again in the course of development, though, unless you're changing something other than source code.

A typical use case would be:

1. Start `combined-db` in `Minikube` using `helm:`

From root level of the project directory:

```bash
helm install --name magda deploy/helm/magda -f deploy/helm/minikube-dev.yml --set tags.all=false --set tags.combined-db=true
```

2. Port forward database service port to localhost so that your local running program (outside the `Kubernetes` cluster in `minikube`) can connect to them:

```bash
# Port forward database
# this command doesn't terminate, so run it in a separate terminal
kubectl port-forward combined-db-0 5432:5432
```

3. Start the registry API and a connector (via `npm run dev`) by executing the following two commands in two separate terminal windows:

```bash
# these two commands don't terminate, so run them in separate terminals
cd magda-registry-api && npm run dev
cd magda-ckan-connector && npm run dev -- --config ../deploy/connector-config/data-gov-au.json
```

See [connectors](connectors.md) for more detailed information about running connectors.

4. (Optional) If later you wanted to start elastic search as well:

Like `combined-db`, elastic search can only be started in `minikube` via `helm` rather than `npm run dev`.

You need to upgrade previously installed `helm` chart `magda` to include `magda-elastic-search` component:

```bash
helm upgrade magda deploy/helm/magda -f deploy/helm/minikube-dev.yml --set tags.all=false --set tags.combined-db=true --set tags.elasticsearch=true
```

And then, port forward `elasticsearch` so that you can run other components that may need to connect to `elasticsearch` outside the `minikube`:

```bash
# Port forward elasticsearch
# this commands doesn't terminate, so run it in a separate terminal
kubectl port-forward es-data-0 9300:9300
```

You can find more information regarding starting `magda` components via `helm` in `minikube` from [the `Running on Minikube` section below](#running-on-minikube)

## What do I need to run?

Running individual components is easy enough, but how do we get a fully working system? It is rarely necessary to run _all_ of MAGDA locally, but various components depend on other components as follows:

| Component                 | Dependencies                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `magda-*-connector`       | `magda-registry-api`                                                                                             |
| `magda-*-sleuther`        | `magda-registry-api`                                                                                             |
| `magda-authorization-api` | `magda-postgres`, `magda-migrator-combined-db`                                                                   |
| `magda-discussions-api`   | `magda-postgres`, `magda-migrator-combined-db`                                                                   |
| `magda-gateway`           | `magda-registry-api`, `magda-search-api`, `magda-web-client`, `magda-authorization-api`, `magda-discussions-api` |
| `magda-indexer`           | `magda-elastic-search`                                                                                           |
| `magda-registry-api`      | `magda-postgres`, `magda-migrator-combined-db`                                                                   |
| `magda-search-api`        | `magda-elastic-search`                                                                                           |
| `magda-web-client`        | `magda-web-server`, but uses API at http://magda-dev.terria.io/api if server is not running.                     |
| `magda-web-server`        | none, but if this is running then `magda-gateway` and its dependencies must be too or API calls will fail.       |

### Architecture Diagram

The following `Architecture Diagram` may help you to get clearer idea which components you need to run in order to look at a particular function area:

![Magda Architecture Diagram](./magda-architecture.png)

The following table shows the relationship between `Magda components` and `Diagram elements`:

| Component                         | Diagram elements                                                                                                                                                                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `magda-admin-api`                 | `Admin API (NodeJS)`                                                                                                                                                                                                                                 |
| `magda-*-connector`               | `Connectors`                                                                                                                                                                                                                                         |
| `magda-elastic-search`            | `ES Client`, `ES Data (x2)`, `ES Master (x3)`                                                                                                                                                                                                        |
| `magda-*-sleuther`                | `Sleuthers`                                                                                                                                                                                                                                          |
| `magda-authorization-api`         | `Auth API (NodeJS)`                                                                                                                                                                                                                                  |
| `magda-discussions-api`           | `Discussion API (NodeJS)`                                                                                                                                                                                                                            |
| `magda-gateway`                   | `Gateway (x1+) (NodeJS)`                                                                                                                                                                                                                             |
| `magda-indexer`                   | `Search Indexer (Scala)`                                                                                                                                                                                                                             |
| `magda-registry-api`              | `Registry API (Scala)`                                                                                                                                                                                                                               |
| `magda-search-api`                | `Search API (Scala)`                                                                                                                                                                                                                                 |
| `magda-web-client`                | `MAGDA Web UI`                                                                                                                                                                                                                                       |
| `magda-web-server`                | `Web Server (NodeJS)`                                                                                                                                                                                                                                |
| `magda-preview-map`               | `Terria Server (NodeJS)`                                                                                                                                                                                                                             |
| `magda-postgres`                  | All databases - see the migrators that set up the individual database schemas below                                                                                                                                                                  |
| `magda-migrator-authorization-db` | `Auth DB (Postgres)`. `magda-migrator-authorization-db` is only used for production environment.                                                                                                                                                     |
| `magda-migrator-discussions-db`   | `Discussion DB (Postgres)`. `magda-migrator-discussions-db` is only used for production environment.                                                                                                                                                 |
| `magda-migrator-registry-db`      | `Registry DB (Postgres)`. `magda-migrator-registry-db` is only used for production environment.                                                                                                                                                      |
| `magda-migrator-session-db`       | `Session DB (Postgres)`. `magda-migrator-session-db` is only used for production environment.                                                                                                                                                        |
| `magda-migrator-combined-db`      | `Registry DB (Postgres)`, `Session DB (Postgres)`, `Discussion DB (Postgres)`, `Auth DB (Postgres)`. `magda-migrator-combined-db` component is only used for dev environment. Production environment will launch all DB components above separately. |

# Debugging Node.js / TypeScript components

Node.js / TypeScript components can easily be debugged using the [Visual Studio Code](https://code.visualstudio.com/) debugger. Set up a launch configuration like this:

```javascript
{
    "type": "node",
    "request": "launch",
    "protocol": "inspector",
    "name": "Launch CKAN Connector",
    "runtimeExecutable": "${workspaceRoot}/scripts/node_modules/.bin/ts-node",
    "windows": {
        "runtimeExecutable": "${workspaceRoot}/scripts/node_modules/.bin/ts-node.cmd"
    },
    "runtimeArgs":[
        "src/index.ts"
    ],
    "args":[
        "--name", "data.gov.au", "--sourceUrl", "https://data.gov.au/"
    ],
    "cwd": "${workspaceRoot}/magda-ckan-connector"
}
```

# Debugging Scala components

Scala components can easily be debugged using the IntelliJ debugger. Create a debug configuration for the `App` class of whatever component you're debugging.

# Running on Minikube

To run all of MAGDA on Minikube, you first need to build all components:

```bash
lerna run build
```

Then, build and push Docker containers for each by running the following in the root MAGDA directory:

```bash
lerna run docker-build-local
```

If you get an error, make sure your Docker environment is set up:

```bash
eval $(minikube docker-env)
```

Next, create the configmaps defining the cluster configuration:

```bash
kubectl create configmap config --from-file deploy/kubernetes/config
kubectl create configmap connector-config --from-file deploy/connector-config
deploy/helm/create-auth-secrets.sh
```

To install _everything_:

```bash
helm install --name magda deploy/helm/magda -f deploy/helm/minikube-dev.yml
```

If you want to just start up individual pods (e.g. just the combined database) you can do so by setting the `all` tag to `false` and the tag for the pod you want to `true`, e.g.

```bash
helm install --name magda deploy/helm/magda -f deploy/helm/minikube-dev.yml --set tags.all=false --set tags.combined-db=true
```

**You can find all available tags in [deploy/helm/magda/requirements.yaml](../deploy/helm/magda/requirements.yaml)**

Once everything starts up, you can access the web front end on http://192.168.99.100:30100. The IP address may be different on your system. Get the real IP address by running:

```bash
minikube ip
```

It's a good idea to add an entry for `minikube.data.gov.au` to your `hosts` file (`C:\Windows\System32\drivers\etc\hosts` on Windows), mapping it to your Minikube IP address. Some services may assume this is in place. For example:

```
192.168.99.100	minikube.data.gov.au
```

## Running on both minikube and locally

It's also possible to run what you're working on your host, and the services your dependent on in minikube. Depending on what you're doing, this might be simple or complicated.

### Using the minikube database

This is super-easy, just run

```bash
 kubectl port-forward combined-db-0 5432:5432
```

Now you can connect to the database in minikube as if it were running locally, while still taking advantage of all the automatic schema setup that the docker image does.

### Running a microservice locally but still connecting through the gateway

You might find yourself developing an API locally that depends on authentication, which is easiest done by just logging in through the web interface and connecting through the gateway. You can actually make this work by telling the gateway to proxy your service to `192.168.99.1` in `deploy/helm/magda/charts/gateway/templates/configmap.yaml`. For instance, if I wanted to run the search api locally, I'd change `configmap.yaml` like so:

```yaml
data:
  # When the config map is mounted as a volume, these will be created as files.
  routes.json: '{
    "search": {
        "to": "http://192.168.99.1:6102/v0"
    },
    # ...etc
```

Then update helm:

```bash
helm upgrade magda -f deploy/helm/minikube-dev.yml deploy/helm/magda
```

Now when I go to `http://${minikube ip}/api/v0/search`, it'll be proxied to my local search rather than the one in minikube.

Be aware that if your local service has to connect to the database or other microservices in minikube you'll have to use `kube-port-forward` to proxy from `localhost:{port}` to the appropriate service in minikube - you can find a list of ports at https://github.com/TerriaJS/magda/blob/master/doc/local-ports.md.

In the likely even you need to figure out what the jwt shared secret is on your minikube, you can cheat by opening up a shell to a container that has that secret and echoing the environment variable:

```bash
kubectl exec -it gateway-cf9c575bb-th57x -- /bin/bash
echo $JWT_SECRET
```

### Running local sleuthers

You can use the same pattern for sleuthers - register a webhook with a url host of `192.168.99.1` and it'll post webhooks to your local machine instead of within the minikube network. Be aware that your sleuther won't be able to find the registry until you use `kubectl port-forward` to make it work... e.g.

```bash
kubectl port-forward registry-api-79f7bf7787-5j52x 6101:80
```
