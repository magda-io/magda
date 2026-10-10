#!/usr/bin/env bash
# Build the #3841 stock DSH agent image and the Agent Manager / mock LLM tools
# image for linux/amd64 (GKE nodes) and push them to a dedicated Artifact
# Registry repo the node service account may read. Replaces the Minikube
# `image load` + `imagePullPolicy: Never` flow.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
POC="$(cd "$HERE/.." && pwd)"
REPO_ROOT="$(git -C "$HERE" rev-parse --show-toplevel)"
source "$HERE/env.sh"
gc artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1 || \
  gc artifacts repositories create "$AR_REPO" --repository-format docker --location "$REGION" \
    --description "Temporary images for magda-io/magda#3848 GKE qualification (delete after test)"
# Private nodes pull as the node pool's service account (here the default
# compute SA, which has no project-level Artifact Registry role).
NODE_SA="$(gc container node-pools describe "$NODE_POOL" --cluster "$CLUSTER" --zone "$ZONE" --format='value(config.serviceAccount)')"
[[ "$NODE_SA" == default || -z "$NODE_SA" ]] && NODE_SA="$(gc projects describe "$PROJECT" --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gc artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member "serviceAccount:$NODE_SA" --role roles/artifactregistry.reader --format=none
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

MGD_CTX="$(mktemp -d)"
trap 'rm -rf "$MGD_CTX"' EXIT
rsync -a --exclude node_modules --exclude bin "$REPO_ROOT/packages/mgd/" "$MGD_CTX/"
docker buildx build --platform linux/amd64 --target stock \
  --build-arg "DSH_VERSION=${DSH_VERSION}" --build-context "mgd=${MGD_CTX}" \
  -t "$DSH_IMAGE" --push "$POC/image"
docker buildx build --platform linux/amd64 -t "$TOOLS_IMAGE" -f "$POC/agent-manager/Dockerfile" --push "$POC"
