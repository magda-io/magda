# Installing Docker Kubernetes

The latest releases of Docker Desktop for Windows and Mac include a Kubernetes setup that works similar to minikube - although in our experience it runs a bit better.

Download and install:

-   [Docker Desktop](https://www.docker.com/products/docker-desktop)

## Setup

Start docker, and find the Docker preferences. Then navigate to "Advanced" and set the resources so your cluster has 2 processors and 4gb of RAM.

![Advanced Tab Screenshot](./screenshots/set-resources-docker-macos.png)

Then enable Kubernetes

![Kubernetes Tab Screenshot](./screenshots/enable-kubernetes-docker-macos-1805.png)

Once it's enabled you can switch your `kubectl` context via the docker menu, or run

```bash
kubectl config use-context docker-for-desktop
```

Last thing to do is create the `standard` storageclass used by Magda:

```bash
kubectl create -f deploy/kubernetes/docker-client-standard-storage.yaml
```
