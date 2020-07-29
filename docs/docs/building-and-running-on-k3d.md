# Building and Running on K3D

## WARNING

For now this is an experimental way of building and running with Magda - it works on one developer's machine, for now. Your mileage may vary!

## Intro

K3D is K3S on docker. It's nice because:

-   It has a docker image registry built into it
-   If you're running on Linux, it doesn't require a VM, so it has similar performance to running everything locally on your host machine (!)
-   Because K3S is lighter-weight than K8S, it should run easier on a dev machine

## Building and Running

To build and run with K3D, Follow the instructions in [building-and-running](./building-and-running), EXCEPT:

-   Install docker and make sure it's running
-   Install K3D
-   Create a K3D instance with `k3d create --enable-registry --publish 30100:30100` and run `export KUBECONFIG=$(k3d get-kubeconfig)` to make `kubectl` see it
-   Put

```
127.0.0.1   registry.local
```

into your hosts file, so that both your local docker and k3d will be able to resolve `registry.local:5000` as a docker registry.

-   When running the create secrets script, select "docker"
-   Don't install the docker registry or docker registry proxy (skip "Install a local kube registry")
-   Don't ever run `eval $(minikube docker-env)`
-   Instead of `docker-build-local`, run `export MAGDA_DOCKER_REPOSITORY=registry.local:5000 && export MAGDA_DOCKER_VERSION=latest && yarn lerna run docker-build-prod -- --concurrency=1 --stream`
-   Instead of `helm install <etc>`, run `helm upgrade --install --timeout 9999s --wait -f deploy/helm/minikube-dev.yml magda deploy/helm/magda --set global.image.repository=registry.local:5000/data61`

This will start an instance of Magda in the default namespace that uses K3D's built-in docker registry instead of the Helm-based one that a minikube install would use.
