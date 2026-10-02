#!/usr/bin/env python3
"""Phase 9: proxy data-path benchmark (stand-in for the future Agent Manager).

For each runtime (gVisor, runc) it creates a sandbox claim, an access relay Pod
(runc, the only ingress source the template NetworkPolicy admits, i.e. the role
the Agent Manager will play) and a load-generator Pod, then runs
scripts/bench/proxy-load.mjs through relay -> sandbox relay -> DSH while
sampling the relay's and the sandbox's pod cgroups once per second.

    scripts/06-proxy-bench.py            # writes results/proxy-bench.json
"""
import importlib.util
import json
import os
import subprocess
import time

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("lt", os.path.join(HERE, "05-load-test.py"))
lt = importlib.util.module_from_spec(spec)
spec.loader.exec_module(lt)
NS = lt.NS
IMAGE = "magda-agent-poc:dev"


def apply(doc):
    subprocess.run(["kubectl", "apply", "-f", "-"], input=doc, text=True, check=True, capture_output=True)


def pod(name, labels, command, env, mem="512Mi"):
    env_yaml = "".join(f"\n        - {{name: {k}, value: \"{v}\"}}" for k, v in env.items())
    return f"""apiVersion: v1
kind: Pod
metadata:
  name: {name}
  namespace: {NS}
  labels: {{{", ".join(f"{k}: {v}" for k, v in labels.items())}}}
spec:
  automountServiceAccountToken: false
  enableServiceLinks: false
  securityContext: {{runAsNonRoot: true, runAsUser: 10001, seccompProfile: {{type: RuntimeDefault}}}}
  containers:
    - name: main
      image: {IMAGE}
      imagePullPolicy: Never
      command: {json.dumps(command)}
      env:{env_yaml or " []"}
      securityContext: {{allowPrivilegeEscalation: false, capabilities: {{drop: ["ALL"]}}}}
      resources:
        requests: {{cpu: 10m, memory: 32Mi}}
        limits: {{cpu: "1", memory: {mem}}}
"""


def bench(pool, tag):
    claim = f"pb-{tag}-{time.strftime('%H%M%S')}"
    lt.create_claims(pool, [claim])
    pods, _ = lt.wait_ready([claim])
    sbx = pods[claim]
    ip = lt.kubectl(f"get pod {sbx} -o jsonpath={{.status.podIP}}")
    token = lt.kubectl(f"logs {sbx} -c agent").split("token=")[-1].split()[0]
    relay, gen = f"relay-{claim}", f"loadgen-{claim}"
    apply(pod(relay, {"app.kubernetes.io/name": "magda-agent-access"},
              ["/usr/bin/tini", "--", "node", "/etc/magda-agent/loopback-relay.mjs"],
              {"RELAY_PORT": "8080", "TARGET_HOST": ip, "TARGET_PORT": "8080"}))
    apply(pod(gen, {"app.kubernetes.io/name": "magda-agent-loadgen"},
              ["/usr/bin/tini", "--", "sleep", "infinity"], {}, mem="2Gi"))
    lt.kubectl(f"wait --for=condition=Ready pod/{relay} pod/{gen} --timeout=120s")
    relay_ip = lt.kubectl(f"get pod {relay} -o jsonpath={{.status.podIP}}")
    uids = {"relay": lt.pod_uid(relay), "sandbox": lt.pod_uid(sbx)}
    time.sleep(10)
    idle = lt.cg_snapshot(uids.values())

    sampler = lt.Sampler(list(uids.values()))
    sampler.start()
    time.sleep(3)
    with open(os.path.join(HERE, "bench", "proxy-load.mjs")) as f:
        subprocess.run(["kubectl", "-n", NS, "exec", "-i", gen, "--", "sh", "-c",
                        "cat > /tmp/proxy-load.mjs"], stdin=f, check=True)
    r = subprocess.run(["kubectl", "-n", NS, "exec", gen, "--", "node", "/tmp/proxy-load.mjs",
                        f"{relay_ip}:8080", token], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"load generator failed: {r.stderr[-800:]}")
    time.sleep(3)
    sampler.stop()
    result = json.loads(r.stdout.strip().splitlines()[-1])
    marks = [l.split(" ", 1) for l in r.stderr.strip().splitlines() if l[:1].isdigit()]
    phases = {}
    for (t1, m1), (t2, m2) in zip(marks, marks[1:]):
        if m1.startswith("start ") and m2.startswith("end "):
            phases[m1[6:]] = (float(t1), float(t2))

    def window(uid, t1, t2):
        rows = sorted((t, m, c) for t, u, m, c in sampler.rows if u == uid and t1 - 1 <= t <= t2 + 1)
        cores = [(c2 - c1) / 1e6 / (b - a) for (a, _m, c1), (b, _n, c2) in zip(rows, rows[1:]) if b > a]
        return dict(max_mem_mib=round(max((m for _t, m, _c in rows), default=0) / 2**20),
                    avg_cores=round(sum(cores) / len(cores), 2) if cores else 0)

    for h in result["http"]:
        t1, t2 = phases[f"{h['path']} c{h['conc']}"]
        h["relay"] = window(uids["relay"], t1, t2)
        h["sandbox"] = window(uids["sandbox"], t1, t2)
    t1, t2 = phases["idle500"]
    result["idle500_relay"] = window(uids["relay"], t1, t2)
    result["relay_idle_mib"] = round(idle[uids["relay"]]["current"] / 2**20)
    result["sandbox_idle_mib"] = round(idle[uids["sandbox"]]["current"] / 2**20)
    lt.kubectl(f"delete pod {relay} {gen} --wait=false")
    lt.kubectl(f"delete sandboxclaim {claim} --wait=false")
    return result


def main():
    report = {"gvisor": bench("magda-agent", "gv"), "runc": bench("magda-agent-runc", "rc")}
    os.makedirs("results", exist_ok=True)
    with open("results/proxy-bench.json", "w") as f:
        json.dump(report, f, indent=1)
    for rt, r in report.items():
        print(f"== {rt}: relay idle {r['relay_idle_mib']} MiB, sandbox idle {r['sandbox_idle_mib']} MiB, "
              f"asset {r['asset'][:40]}… ({r['assetBytes']} B), idle conns ok {r['idle_conns_ok']}, "
              f"relay during 500 idle conns {r['idle500_relay']}")
        for h in r["http"]:
            print(f"   {h['path']:5} c={h['conc']:<3} {h['rps']:>5} req/s {h['mb_s']:>6} MB/s "
                  f"p50 {h['p50_ms']}ms p95 {h['p95_ms']}ms p99 {h['p99_ms']}ms err {h['errors']} | "
                  f"relay {h['relay']} | sandbox {h['sandbox']}")


if __name__ == "__main__":
    main()
