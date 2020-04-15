# Building and Running on MicroK8S

## WARNING

For now this is an experimental way of building and running with Magda - it works on one developer's machine, for now. Your mileage may vary!

## Intro

MicroK8S is another way of running a local Kubernetes cluster - it's nice because:

-   It has a bunch of stuff built in to it, like Helm and a local docker repository
-   If you're running on Linux, it doesn't require a VM, so it has similar performance to running everything locally on your host machine (!)

## Building and Running

To build and run with MicroK8S, Follow the instructions in [building-and-running](./building-and-running), EXCEPT:

-   Install MicroK8S, and enable the registry and helm3 plugins
-   Don't install the docker registry or docker registry proxy (skip "Install a local kube registry")
-   Don't ever run `eval $(minikube docker-env)`
-   Instead of `docker-build-local`, run `MAGDA_DOCKER_REPOSITORY=localhost:32000 MAGDA_DOCKER_VERSION=latest yarn lerna run docker-build-prod --concurrency=1 --stream -- -- --repository localhost:32000 --version latest`
-   Instead of `helm install <etc>`, run `microk8s helm3 upgrade --install --timeout 9999s --wait -f deploy/helm/minikube-dev.yml magda deploy/helm/magda --set global.image.repository=localhost:32000/data61`

This will start an instance of Magda in the default namespace that uses MicroK8S' built-in docker registry instead of the Helm-based one that a minikube install would use.
