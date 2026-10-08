#!/usr/bin/env bash
# Minikube profile for #3841: containerd + gVisor (pinned runsc, see the #3812
# PoC for why the addon binary is replaced), the ingress-nginx addon, and node
# ports 443/80 published on the host as 127.0.0.1:18443/18080 so a browser on
# the host reaches the real ingress as https://magda.test:18443 without
# `kubectl port-forward` or `minikube tunnel`. Then Agent Sandbox v1.0.4.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PROFILE="${PROFILE:-magda-agent-poc}"
CPUS="${CPUS:-5}"
MEMORY="${MEMORY:-12g}"
DISK="${DISK:-60g}"
GVISOR_RELEASE="${GVISOR_RELEASE:-20260928.0}"

case "$(uname -m)" in
  arm64 | aarch64) ARCH=aarch64 ;;
  x86_64 | amd64) ARCH=x86_64 ;;
  *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

minikube start -p "$PROFILE" --driver=docker --container-runtime=containerd \
  --cpus="$CPUS" --memory="$MEMORY" --disk-size="$DISK" \
  --ports=127.0.0.1:18443:443 --ports=127.0.0.1:18080:80

minikube -p "$PROFILE" addons enable gvisor
kubectl wait -n kube-system --for=condition=Ready pod/gvisor --timeout=300s
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BASE="https://github.com/google/gvisor/releases/download/release-${GVISOR_RELEASE}"
TARBALL="gvisor-${ARCH}.tar.bz2"
curl -fsSL -o "$WORK/$TARBALL" "$BASE/$TARBALL"
curl -fsSL -o "$WORK/SHA512SUMS" "$BASE/SHA512SUMS"
(cd "$WORK" && grep " ${TARBALL}\$" SHA512SUMS | shasum -a 512 -c -)
bunzip2 "$WORK/$TARBALL"
minikube -p "$PROFILE" cp "$WORK/gvisor-${ARCH}.tar" /tmp/gvisor.tar
minikube -p "$PROFILE" ssh -- "sudo tar -xf /tmp/gvisor.tar -C /usr/bin && \
  sudo chmod 0755 /usr/bin/runsc /usr/bin/containerd-shim-runsc-v1 && \
  sudo rm -f /tmp/gvisor.tar && /usr/bin/runsc --version"

minikube -p "$PROFILE" addons enable ingress
minikube -p "$PROFILE" addons enable metrics-server
kubectl -n ingress-nginx rollout status deploy/ingress-nginx-controller --timeout=300s

"$HERE/../agent-sandbox-minikube/scripts/02-install-agent-sandbox.sh"
kubectl get runtimeclass gvisor
