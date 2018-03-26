# Installing Minikube

Minikube is a local Virtual Machine with Kubernetes that runs locally, and you can use it just like you'd use a remote Kubernetes cluster.

You'll need to download and install:

*   [VirtualBox](https://www.virtualbox.org/wiki/Downloads) We find this is the best virtual machine to use with minikube.
*   [Minikube](https://github.com/kubernetes/minikube)

## Setup

Run the following to give your VM enough juice to run Magda and start it up:

```bash
minikube config set memory 4096
minikube config set cpus 2
minikube config set vm-driver virtualbox
minikube start
```

This reserves 4 GB of RAM for Minikube and starts it up. If you're low on RAM and only intend to run the databases on Minikube, you can likely get away with a smaller number, like 2048.

More detailed instructions for setting up Minikube can be found [here](https://github.com/kubernetes/minikube) if that doesn't work.

To set up the environment variables necessary for Docker to interact with the Minikube VM, run:

```bash
eval $(minikube docker-env)
```

You'll need to run this in each new shell.
