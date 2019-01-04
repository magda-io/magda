# How to update kubernetes cluster

When you need to use features of new versions of k8s clusters.
When it is okay to have downtime.

Get a list of available cluster versions (e.g. in zone asia-east1-a):
gcloud container get-server-config --zone asia-east1-a

Get a list of clusters:
gcloud container clusters list

Upgrade k8s master (e.g. updating dev-new):
gcloud container clusters upgrade dev-new --cluster-version=1.11.3-gke.18 --master

Get list of node pools:
gcloud container node-pools list --cluster=dev-new

Upgrade each node pool
gcloud container clusters upgrade dev-new --node-pool=non-preemptible
gcloud container clusters upgrade dev-new --node-pool=preemptible-dual-core

Wait a 10-15 minutes for everything to be back up.
