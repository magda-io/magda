#!/usr/bin/env bash
# Prove the ingress-nginx LoadBalancer is an external *passthrough* (L4) Network
# Load Balancer with a regional backend service, not a target-pool NLB and not
# a Google Cloud L7 HTTP(S) load balancer. Reads the real GCP resources.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
source "$HERE/env.sh"
IP="$(lb_ip)"
[[ -n "$IP" ]] || { echo "no LoadBalancer IP yet" >&2; exit 1; }
fail=0
check() { if [[ "$2" == "$3" ]]; then echo "PASS $1 ($2)"; else echo "FAIL $1: got '$2', want '$3'"; fail=1; fi; }

FR="$(gc compute forwarding-rules list --filter="IPAddress=$IP" --format=json)"
[[ "$(jq length <<<"$FR")" == 1 ]] || { echo "FAIL expected exactly one forwarding rule for $IP"; jq -r '.[].name' <<<"$FR"; exit 1; }
echo "$FR" | jq '.[0] | {name, region: (.region|split("/")|last), IPAddress, IPProtocol, ports, portRange, loadBalancingScheme, networkTier, backendService: (.backendService // null), target: (.target // null), description}'
check "forwarding rule is regional (global = L7/proxy LB)" "$(jq -r '.[0].region != null' <<<"$FR")" true
check "loadBalancingScheme" "$(jq -r '.[0].loadBalancingScheme' <<<"$FR")" EXTERNAL
check "IPProtocol (L4)" "$(jq -r '.[0].IPProtocol' <<<"$FR")" TCP
check "points at a backend service (l4-rbs), not a target pool / target proxy" \
  "$(jq -r '(.[0].backendService // "") | test("/backendServices/")' <<<"$FR")" true

BS_URL="$(jq -r '.[0].backendService' <<<"$FR")"
BS="$(gc compute backend-services describe "${BS_URL##*/}" --region "$REGION" --format=json)"
echo "$BS" | jq '{name, protocol, loadBalancingScheme, sessionAffinity, backends: [.backends[] | {group: (.group|split("/")|last), balancingMode}], healthChecks: [.healthChecks[]|split("/")|last]}'
check "backend service protocol (TCP passthrough)" "$(jq -r '.protocol' <<<"$BS")" TCP
check "backend service scheme" "$(jq -r '.loadBalancingScheme' <<<"$BS")" EXTERNAL
# An L7 LB would need a target HTTP(S) proxy + URL map in front of the IP.
L7="$(gc compute target-https-proxies list --format='value(name)' 2>/dev/null | wc -l | tr -d ' ')"
URLMAPS_FOR_BS="$(gc compute url-maps list --format=json | jq --arg bs "$BS_URL" '[.[] | select((.defaultService // "") == $bs)] | length')"
check "no URL map routes to this backend service" "$URLMAPS_FOR_BS" 0
echo "INFO target HTTPS proxies in the project (unrelated to this IP): $L7"
echo "INFO firewall rules for the Service:"
gc compute firewall-rules list --filter="description~ingress-nginx-3848" \
  --format="table(name,sourceRanges.list(),allowed[].map().firewall_rule().list(),targetTags.list())"
exit $fail
