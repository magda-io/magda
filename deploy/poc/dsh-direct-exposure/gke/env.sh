# Shared settings for the #3848 GKE qualification scripts. Source it; every
# value can be overridden from the environment. Nothing here touches namespaces
# other than NS / INGRESS_NS / agent-sandbox-system.
PROJECT="${PROJECT:-ai4m-p11-dev-a8f7}"
ZONE="${ZONE:-australia-southeast1-a}"
REGION="${REGION:-${ZONE%-*}}"
CLUSTER="${CLUSTER:-ai4m-p11-dev}"
KUBE_CONTEXT="${KUBE_CONTEXT:-gke_${PROJECT}_${ZONE}_${CLUSTER}}"
NODE_POOL="${NODE_POOL:-kas-gvisor-3848}"
NODE_MACHINE_TYPE="${NODE_MACHINE_TYPE:-e2-standard-2}"
NODE_SPOT="${NODE_SPOT:-true}"
AR_REPO="${AR_REPO:-magda-kas-poc}"
REGISTRY="${REGISTRY:-${REGION}-docker.pkg.dev/${PROJECT}/${AR_REPO}}"
DSH_VERSION="${DSH_VERSION:-0.2.1-alpha.1}"
DSH_IMAGE="${DSH_IMAGE:-${REGISTRY}/magda-agent-dsh:stock-${DSH_VERSION}}"
TOOLS_IMAGE="${TOOLS_IMAGE:-${REGISTRY}/magda-agent-poc-tools:dev}"
AGENT_SANDBOX_VERSION="${AGENT_SANDBOX_VERSION:-v1.0.4}"
INGRESS_NGINX_CHART_VERSION="${INGRESS_NGINX_CHART_VERSION:-4.15.1}"
INGRESS_NS="${INGRESS_NS:-ingress-nginx-3848}"
INGRESS_CLASS="${INGRESS_CLASS:-nginx-3848}"
NS="${NS:-magda-gke-3848}"
# The PoC test user (any UUID; the claim label ties it to the Agent Manager lookup).
TEST_USER_ID="${TEST_USER_ID:-00000000-0000-4000-8000-00000000a11c}"
# Who may reach the test LoadBalancer (default: this machine's egress IP).
LB_SOURCE_RANGES="${LB_SOURCE_RANGES:-}"

k() { kubectl --context "$KUBE_CONTEXT" "$@"; }
gc() { gcloud --project "$PROJECT" "$@"; }
# External endpoint: <lb-ip>.sslip.io (public wildcard DNS, no DNS change needed).
lb_ip() { k -n "$INGRESS_NS" get svc ingress-nginx-3848-controller -o jsonpath='{.status.loadBalancer.ingress[0].ip}'; }
external_host() { echo "$(lb_ip | tr . -).sslip.io"; }
