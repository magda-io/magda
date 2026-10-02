#!/usr/bin/env bash
# Phase 1: create a dedicated Minikube profile with containerd + gVisor.
#
# The minikube `gvisor` addon (minikube v1.38.1, addon image
# registry.k8s.io/minikube/gvisor:v0.0.4) still downloads
#   https://storage.googleapis.com/gvisor/releases/release/latest/<arch>/runsc
# which no longer exists (gVisor moved to a tarball layout in 2026-07, see
# https://github.com/google/gvisor/issues/13718). The addon therefore writes a
# GCS "NoSuchKey" XML document to /usr/bin/runsc and every gVisor Pod fails with
# `exec format error`. We keep the addon (it configures containerd + creates the
# `gvisor` RuntimeClass) and then overwrite the binaries with a pinned release.
set -euo pipefail

PROFILE="${PROFILE:-magda-agent-poc}"
CPUS="${CPUS:-6}"
MEMORY="${MEMORY:-16g}"
DISK="${DISK:-60g}"
GVISOR_RELEASE="${GVISOR_RELEASE:-20260928.0}"

case "$(uname -m)" in
  arm64 | aarch64) ARCH=aarch64 ;;
  x86_64 | amd64) ARCH=x86_64 ;;
  *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;;
esac

minikube start -p "$PROFILE" \
  --driver=docker \
  --container-runtime=containerd \
  --cpus="$CPUS" --memory="$MEMORY" --disk-size="$DISK"

minikube -p "$PROFILE" addons enable gvisor
kubectl wait -n kube-system --for=condition=Ready pod/gvisor --timeout=300s

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
BASE="https://github.com/google/gvisor/releases/download/release-${GVISOR_RELEASE}"
TARBALL="gvisor-${ARCH}.tar.bz2"
curl -fsSL -o "$WORK/$TARBALL" "$BASE/$TARBALL"
curl -fsSL -o "$WORK/SHA512SUMS" "$BASE/SHA512SUMS"
(cd "$WORK" && grep " ${TARBALL}\$" SHA512SUMS | shasum -a 512 -c -)

# The kicbase node image has neither bzip2 nor zstd: decompress on the host.
bunzip2 "$WORK/$TARBALL"
minikube -p "$PROFILE" cp "$WORK/gvisor-${ARCH}.tar" /tmp/gvisor.tar
# runsc looks for gvisor-bin/ next to its own binary, so extract the whole
# tarball into /usr/bin (where the addon configured containerd to find it).
minikube -p "$PROFILE" ssh -- "sudo tar -xf /tmp/gvisor.tar -C /usr/bin && \
  sudo chmod 0755 /usr/bin/runsc /usr/bin/containerd-shim-runsc-v1 && \
  sudo rm -f /tmp/gvisor.tar && /usr/bin/runsc --version"

kubectl get runtimeclass gvisor
