#!/usr/bin/env bash
# Add a small GKE Sandbox (gVisor) node pool. GKE Sandbox cannot be enabled on
# default-pool (a non-sandbox pool must remain for system workloads); GKE labels
# and taints the nodes sandbox.gke.io/runtime=gvisor and the cluster's
# `gvisor` RuntimeClass carries the matching nodeSelector + toleration, so no
# existing workload lands on the new node.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
SPOT=(); [[ "$NODE_SPOT" == true ]] && SPOT=(--spot)
gc container node-pools create "$NODE_POOL" --cluster "$CLUSTER" --zone "$ZONE" \
  --sandbox type=gvisor --image-type COS_CONTAINERD \
  --machine-type "$NODE_MACHINE_TYPE" "${SPOT[@]}" --num-nodes 1 \
  --disk-type pd-balanced --disk-size 50 \
  --node-labels magda.io/poc=gke-3848 \
  --shielded-secure-boot --shielded-integrity-monitoring \
  --workload-metadata GKE_METADATA
k get nodes -L sandbox.gke.io/runtime,cloud.google.com/gke-nodepool,cloud.google.com/gke-spot
k get runtimeclass gvisor -o jsonpath='{.handler} {.scheduling}{"\n"}'
