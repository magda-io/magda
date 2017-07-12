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

To run a built component, run the following in a component directory:

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

See [connectors](connectors.md) for more detailed information about running connectors.

## What do I need to run?

Running individual components is easy enough, but how do we get a fully working system?  It is rarely necessary to run _all_ of MAGDA locally, but various components depend on other components as follows:

| Component | Dependencies |
| --------- | ------------ |
| `magda-*-connector` | `magda-registry-api` |
| `magda-*-sleuther` | `magda-registry-api` |
| `magda-auth-api` | `magda-combined-db` |
| `magda-discussions-api` | `magda-combined-db` |
| `magda-gateway` | `magda-registry-api`, `magda-search-api`, `magda-web-client`, `magda-auth-api`, `magda-discussions-api` |
| `magda-indexer` | `magda-elastic-search` |
| `magda-registry-api` | `magda-combined-db` |
| `magda-search-api` | `magda-elastic-search` |
| `magda-web-client` | `magda-web-server`, but uses API at http://magda-dev.terria.io/api if server is not running. |
| `magda-web-server` | none, but if this is running then `magda-gateway` and its dependencies must be too or API calls will fail. |

# Debugging Node.js / TypeScript components

Node.js / TypeScript components can easily be debugged using the [Visual Studio Code](https://code.visualstudio.com/) debugger.  Set up a launch configuration like this:

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

Scala components can easily be debugged using the IntelliJ debugger.  Create a debug configuration for the `App` class of whatever component you're debugging.

# Running on Minikube

To run all of MAGDA on Minikube, you first need to build all components:

```bash
npm run build
```

Then, build and push Docker containers for each by running the following in the root MAGDA directory:

```bash
npm run docker-build-local
```

If you get an error, make sure your Docker environment is set up:

```bash
eval $(minikube docker-env)
```

Next, create the configmaps defining the cluster configuration:

```bash
kubectl create configmap config --from-file deploy/kubernetes/config
kubectl create configmap connector-config --from-file deploy/connector-config
```

Then, create all the pods and services by running:

```bash
kubectl apply -f deploy/kubernetes/local/base
```

Once everything starts up, you can access the web front end on http://192.168.99.100:30016.  The IP address may be different on your system.  Get the real IP address by running:

```bash
minikube ip
```

It's a good idea to add an entry for `minikube.data.gov.au` to your `hosts` file (`C:\Windows\System32\drivers\etc\hosts` on Windows), mapping it to your Minikube IP address.  Some services may assume this is in place.  For example:

```
192.168.99.100	minikube.data.gov.au
```
