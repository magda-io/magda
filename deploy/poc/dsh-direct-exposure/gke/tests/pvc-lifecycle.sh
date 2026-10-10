#!/usr/bin/env bash
# #3848 PVC provision / mount / reclaim on GKE for a gVisor Sandbox (own test
# user, so other running tests are not disturbed):
#   claim -> PD-CSI volume provisioned (WaitForFirstConsumer) and mounted under gVisor
#   -> write a marker -> Sandbox suspend (Pod gone, PVC kept) -> resume (marker intact)
#   -> delete the Pod (controller recreates it, marker intact)
#   -> delete the claim -> Sandbox/Pod/Service/PVC gone, PV + GCE disk deleted.
set -uo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
export TEST_USER_ID="${PVC_TEST_USER_ID:-00000000-0000-4000-8000-000000000d0d}"
TEMPLATE="${1:-dsh-gvisor}"
fails=0
pass() { echo "PASS $*"; }
fail() { echo "FAIL $*"; fails=$((fails + 1)); }
info() { echo "INFO $*"; }
wait_ready() { k -n "$NS" wait --for=condition=Ready "sandbox/$1" --timeout=600s >/dev/null && k -n "$NS" wait --for=condition=Ready "pod/$1" --timeout=600s >/dev/null; }

"$HERE/scripts/claim.sh" "$TEMPLATE"
CLAIM="$(k -n "$NS" get sandboxclaim -l "magda.io/agent-user=$TEST_USER_ID" -o jsonpath='{.items[0].metadata.name}')"
SBX="$(k -n "$NS" get sandboxclaim "$CLAIM" -o jsonpath='{.status.sandbox.name}')"
PVC="data-$SBX"
PV="$(k -n "$NS" get pvc "$PVC" -o jsonpath='{.spec.volumeName}')"
DISK="$(k get pv "$PV" -o jsonpath='{.spec.csi.volumeHandle}')"
info "claim $CLAIM sandbox $SBX pvc $PVC pv $PV storageClass $(k -n "$NS" get pvc "$PVC" -o jsonpath='{.spec.storageClassName}') reclaimPolicy $(k get pv "$PV" -o jsonpath='{.spec.persistentVolumeReclaimPolicy}')"
info "GCE disk: $(gc compute disks describe "${DISK##*/}" --zone "$ZONE" --format='value(name,sizeGb,type.basename(),status)') (PVC requested 1Gi, capacity $(k -n "$NS" get pvc "$PVC" -o jsonpath='{.status.capacity.storage}'))"
info "PVC owner: $(k -n "$NS" get pvc "$PVC" -o jsonpath='{.metadata.ownerReferences[*].kind}/{.metadata.ownerReferences[*].name}')"
info "runtime $(k -n "$NS" get pod "$SBX" -o jsonpath='{.spec.runtimeClassName}') node $(k -n "$NS" get pod "$SBX" -o jsonpath='{.spec.nodeName}')"
MOUNT="$(k -n "$NS" exec "$SBX" -c agent -- sh -c 'grep " /data " /proc/mounts; stat -c "%U:%G %a" /data; df -h /data | tail -1' 2>&1)"
info "mount inside gVisor: $(tr '\n' ' ' <<<"$MOUNT")"
MARK="pvc-$(date +%s)"
k -n "$NS" exec "$SBX" -c agent -- sh -c "echo $MARK > /data/marker && sync && cat /data/marker" >/dev/null && pass "non-root (uid 10001, fsGroup) can write the PD-backed volume under gVisor" || fail "write to /data"
CREATED="$(k -n "$NS" exec "$SBX" -c agent -- cat /data/.created-at)"
UID1="$(k -n "$NS" get pod "$SBX" -o jsonpath='{.metadata.uid}')"

# Suspend / resume (Agent Sandbox v1.0.4 operatingMode)
k -n "$NS" patch sandbox "$SBX" --type=merge -p '{"spec":{"operatingMode":"Suspended"}}' >/dev/null
k -n "$NS" wait --for=delete "pod/$SBX" --timeout=300s >/dev/null 2>&1
if k -n "$NS" get pod "$SBX" >/dev/null 2>&1; then fail "Pod still present after suspend"; else pass "suspend: Pod deleted"; fi
[[ "$(k -n "$NS" get pvc "$PVC" -o jsonpath='{.status.phase}')" == Bound ]] && pass "suspend: PVC kept (Bound)" || fail "suspend: PVC not Bound"
t=$(date +%s)
k -n "$NS" patch sandbox "$SBX" --type=merge -p '{"spec":{"operatingMode":"Running"}}' >/dev/null
sleep 3; wait_ready "$SBX"
info "resume -> Ready in $(( $(date +%s) - t ))s (PD re-attach + DSH start)"
[[ "$(k -n "$NS" exec "$SBX" -c agent -- cat /data/marker)" == "$MARK" ]] && pass "resume: marker survived suspend/resume" || fail "resume: marker lost"
[[ "$(k -n "$NS" exec "$SBX" -c agent -- cat /data/.created-at)" == "$CREATED" ]] && pass "resume: same volume (.created-at unchanged)" || fail "resume: different volume"
[[ "$(k -n "$NS" get pod "$SBX" -o jsonpath='{.metadata.uid}')" != "$UID1" ]] && pass "resume: new Pod" || fail "resume: same Pod uid"

# Pod deleted out from under the controller
UID2="$(k -n "$NS" get pod "$SBX" -o jsonpath='{.metadata.uid}')"
k -n "$NS" delete pod "$SBX" --wait=true >/dev/null
t=$(date +%s)
for _ in $(seq 120); do
  u="$(k -n "$NS" get pod "$SBX" -o jsonpath='{.metadata.uid}' 2>/dev/null)"
  [[ -n "$u" && "$u" != "$UID2" ]] && break
  sleep 2
done
if wait_ready "$SBX"; then
  pass "deleted Pod recreated by the controller in $(( $(date +%s) - t ))s"
  [[ "$(k -n "$NS" exec "$SBX" -c agent -- cat /data/marker)" == "$MARK" ]] && pass "marker survived Pod deletion" || fail "marker lost after Pod deletion"
else
  fail "Pod not recreated after deletion"
fi

# Reclaim
k -n "$NS" delete sandboxclaim "$CLAIM" --wait=true >/dev/null
for _ in $(seq 60); do k -n "$NS" get pvc "$PVC" >/dev/null 2>&1 || break; sleep 2; done
k -n "$NS" get sandbox "$SBX" >/dev/null 2>&1 && fail "Sandbox still present after claim deletion" || pass "claim deleted -> Sandbox deleted"
k -n "$NS" get svc "$SBX" >/dev/null 2>&1 && fail "Service still present" || pass "claim deleted -> Service deleted"
if k -n "$NS" get pvc "$PVC" >/dev/null 2>&1; then
  fail "PVC $PVC still present after claim deletion (would leak a disk)"
else
  pass "claim deleted -> PVC deleted"
  for _ in $(seq 60); do k get pv "$PV" >/dev/null 2>&1 || break; sleep 3; done
  k get pv "$PV" >/dev/null 2>&1 && fail "PV $PV still present" || pass "PV deleted (reclaimPolicy Delete)"
  for _ in $(seq 60); do gc compute disks describe "${DISK##*/}" --zone "$ZONE" >/dev/null 2>&1 || break; sleep 5; done
  gc compute disks describe "${DISK##*/}" --zone "$ZONE" >/dev/null 2>&1 && fail "GCE disk ${DISK##*/} still exists" || pass "GCE PD ${DISK##*/} deleted"
fi
echo "== $fails failure(s)"
exit $fails
