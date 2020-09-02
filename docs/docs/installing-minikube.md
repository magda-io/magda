# Installing Minikube

Minikube is a local Virtual Machine with Kubernetes that runs locally, and you can use it just like you'd use a remote Kubernetes cluster.

You'll need to download and install:

-   [VirtualBox](https://www.virtualbox.org/wiki/Downloads) We find this is the best virtual machine to use with minikube.
-   [Minikube](https://github.com/kubernetes/minikube)

## Setup

Run the following to give your VM enough juice (Magda requires at least 6GB ram to deploy all modules) to run Magda and start it up:

```bash
minikube config set memory 6144
minikube config set cpus 2
minikube config set vm-driver virtualbox
minikube start
```

This reserves 6 GB of RAM for Minikube and starts it up. If you're low on RAM and only intend to run the databases on Minikube, you can likely get away with a smaller number, like 2048.

More detailed instructions for setting up Minikube can be found [here](https://github.com/kubernetes/minikube) if that doesn't work.

To set up the environment variables necessary for Docker to interact with the Minikube VM, run:

```bash
eval $(minikube docker-env)
```

You'll need to run this in each new shell.

## Minikube on Windows Subsystem for Linux (WSL)

A few notes for setting up Minikube in a WSL environment:

-   Install `minikube` for _Windows_ (not the Linux version in WSL, it won't work).
-   Install `docker` and `kubectl` in _WSL_.
-   Create a simple bash script named `minikube` to run the Windows version of minikube and put it in your path in your WSL environment:

```bash
#!/bin/sh
/mnt/c/Program\ Files/Kubernetes/Minikube/minikube.exe $@
```

-   Start `minikube` (from Windows or WSL is fine) by running `minikube start`
-   The above will configure _Windows_ `kubectl` to be able to talk to Kubernetes in minikube, but the `kubectl` in WSL won't work. To fix that, open `%userprofile%\.kube\config` in a text editor and copy all the minikube context, cluster, and user from there into `~/.kube/config` in your WSL environment.
-   Create another bash script named `minikube-go` in your WSL path to configure WSL Docker to talk to minikube:

```bash
#!/bin/sh
eval $(minikube docker-env --shell=bash)
export DOCKER_CERT_PATH=$(wslpath -u "${DOCKER_CERT_PATH}")
```

-   Run the `minikube-go` in each new WSL terminal, instead of the `eval $(minikube docker-env)` in the instructions above: `source minikube-go`.
