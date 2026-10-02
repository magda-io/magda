#!/usr/bin/env python3
"""Phase 9 load test: N concurrent sandboxes running a workload, measured from
the node's cgroup v2 counters (pod-level, so gVisor's sentry/gofer are included).

    scripts/05-load-test.py --pool magda-agent      -n 6 --workload scripted
    scripts/05-load-test.py --pool magda-agent-runc -n 6 --workload scripted
    scripts/05-load-test.py --pool magda-agent      -n 4 --workload agent

`scripted` runs scripts/bench/workload.py (no LLM). `agent` runs one headless
DSH natural-language task (mgd search/download + pandas) per sandbox and uses
the OpenAI key from the magda-agent-llm Secret.

Writes a JSON report to --out (default: ./loadtest-<pool>-<workload>-<n>.json)
and prints a summary. Claims are deleted at the end.
"""
import argparse
import json
import os
import subprocess
import threading
import time

NS = "magda-agent-poc"
PROFILE = "magda-agent-poc"
HERE = os.path.dirname(os.path.abspath(__file__))

AGENT_PROMPT = (
    "Using the Magda catalog via the mgd CLI, search for datasets about 'ocean' "
    "and pick one that has a downloadable CSV distribution (try "
    "dist-dga-4328a11d-775f-4530-8aae-e0c5b19d1a1b if others fail). Download it "
    "into this workspace with mgd, analyse it with Python pandas (row count, "
    "columns, a summary of the text length of one column) and answer in 5 lines. "
    "Use sandbox_permissions workspace-write if a parameter is required."
)


def sh(cmd, **kw):
    return subprocess.run(cmd, shell=True, check=True, capture_output=True, text=True, **kw).stdout


def kubectl(args, **kw):
    return sh(f"kubectl -n {NS} {args}", **kw)


def create_claims(pool, names):
    docs = "\n---\n".join(
        f"""apiVersion: extensions.agents.x-k8s.io/v1beta1
kind: SandboxClaim
metadata: {{name: {n}, namespace: {NS}, labels: {{magda.io/loadtest: "true"}}}}
spec: {{warmPoolRef: {{name: {pool}}}}}"""
        for n in names
    )
    subprocess.run(["kubectl", "apply", "-f", "-"], input=docs, text=True, check=True, capture_output=True)


def wait_ready(names):
    t0 = time.time()
    kubectl("wait --for=condition=Ready " + " ".join(f"sandboxclaim/{n}" for n in names) + " --timeout=600s")
    pods = {n: kubectl(f"get sandboxclaim {n} -o jsonpath={{.status.sandbox.name}}") for n in names}
    for p in pods.values():
        while "dsh web:" not in kubectl(f"logs {p} -c agent"):
            time.sleep(0.5)
    return pods, time.time() - t0


def pod_uid(pod):
    return kubectl(f"get pod {pod} -o jsonpath={{.metadata.uid}}")


def cg_snapshot(uids):
    """One-shot read of memory.current/peak/stat(anon,file) per pod cgroup."""
    script = "; ".join(
        f'd=$(ls -d /sys/fs/cgroup/kubepods/*/pod{u} /sys/fs/cgroup/kubepods/pod{u} 2>/dev/null | head -1); '
        f'echo "{u} $(cat $d/memory.current) $(cat $d/memory.peak) '
        f'$(grep -E \'^(anon|file) \' $d/memory.stat | cut -d\' \' -f2 | tr \'\\n\' \' \')"'
        for u in uids
    )
    out = subprocess.run(
        ["minikube", "-p", PROFILE, "ssh", "--", script],
        check=True, capture_output=True, text=True,
    ).stdout
    snap = {}
    for line in out.strip().splitlines():
        u, cur, peak, anon, file = line.split()[:5]
        snap[u] = dict(current=int(cur), peak=int(peak), anon=int(anon), file=int(file))
    return snap


class Sampler(threading.Thread):
    """Samples memory.current + cpu usage_usec of each pod every second."""

    def __init__(self, uids):
        super().__init__(daemon=True)
        loop = " ".join(
            f'd=$(ls -d /sys/fs/cgroup/kubepods/*/pod{u} /sys/fs/cgroup/kubepods/pod{u} 2>/dev/null | head -1); '
            f'echo "$t {u} $(cat $d/memory.current) $(grep usage_usec $d/cpu.stat | cut -d\' \' -f2)";'
            for u in uids
        )
        self.cmd = [
            "minikube", "-p", PROFILE, "ssh", "--",
            f"while true; do t=$(date +%s.%N); {loop} sleep 1; done",
        ]
        self.rows = []
        self.proc = None

    def run(self):
        self.proc = subprocess.Popen(self.cmd, stdout=subprocess.PIPE, text=True)
        for line in self.proc.stdout:
            parts = line.split()
            if len(parts) == 4:
                self.rows.append((float(parts[0]), parts[1], int(parts[2]), int(parts[3])))

    def stop(self):
        if self.proc:
            self.proc.terminate()


def run_workload(pod, workload, rows, out):
    t0 = time.time()
    if workload == "scripted":
        with open(os.path.join(HERE, "bench", "workload.py")) as f:
            r = subprocess.run(
                ["kubectl", "-n", NS, "exec", "-i", pod, "--", "env", f"BENCH_ROWS={rows}", "python3", "-"],
                stdin=f, capture_output=True, text=True,
            )
        try:
            out[pod] = {"steps": json.loads(r.stdout.strip().splitlines()[-1])}
        except Exception:
            out[pod] = {"error": (r.stderr or r.stdout)[-500:]}
    else:
        r = subprocess.run(
            ["kubectl", "-n", NS, "exec", pod, "--", "bash", "-c",
             "cd /data/workspace && timeout 1200 dsh --profile headless "
             "--patch /etc/magda-agent/magda.cordis.patch.yml \"$0\"", AGENT_PROMPT],
            capture_output=True, text=True,
        )
        out[pod] = {"rc": r.returncode, "answer_tail": r.stdout[-600:]}
    out[pod]["wall_s"] = round(time.time() - t0, 1)


def summarise(samples, uids, t_start, t_end):
    per = {}
    by = {}
    for t, u, mem, cpu in samples:
        by.setdefault(u, []).append((t, mem, cpu))
    total_by_t = {}
    for u, rows in by.items():
        rows.sort()
        cores = [
            (c2 - c1) / 1e6 / (t2 - t1)
            for (t1, _m1, c1), (t2, _m2, c2) in zip(rows, rows[1:]) if t2 > t1
        ]
        run = [(t, m) for t, m, _c in rows if t_start <= t <= t_end]
        per[u] = dict(
            max_mem_mib=round(max(m for _t, m, _c in rows) / 2**20),
            avg_cores=round(sum(cores) / len(cores), 2) if cores else 0,
            max_cores=round(max(cores), 2) if cores else 0,
        )
        for t, m in run:
            total_by_t.setdefault(round(t), 0)
            total_by_t[round(t)] += m
    # total CPU across pods per sample interval
    return per, round(max(total_by_t.values()) / 2**20) if total_by_t else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pool", default="magda-agent")
    ap.add_argument("-n", type=int, default=4)
    ap.add_argument("--workload", choices=["scripted", "agent"], default="scripted")
    ap.add_argument("--rows", type=int, default=5_000_000)
    ap.add_argument("--out")
    ap.add_argument("--keep", action="store_true", help="do not delete claims")
    a = ap.parse_args()

    tag = "rc" if a.pool.endswith("runc") else "gv"
    # Unique per run: reusing a claim (and so PVC) name right after deletion
    # races the hostPath provisioner's cleanup of the old volume directory.
    run_id = time.strftime("%H%M%S")
    names = [f"lt-{tag}-{a.workload[:2]}-{run_id}-{i}" for i in range(a.n)]
    report = dict(pool=a.pool, n=a.n, workload=a.workload, rows=a.rows)
    create_claims(a.pool, names)
    pods, ready_s = wait_ready(names)
    report["all_ready_and_serving_s"] = round(ready_s, 1)
    uids = {p: pod_uid(p) for p in pods.values()}
    time.sleep(20)  # let DSH settle after boot
    idle = cg_snapshot(uids.values())
    report["idle"] = {p: {k: round(v / 2**20) for k, v in idle[u].items()} for p, u in uids.items()}

    sampler = Sampler(list(uids.values()))
    sampler.start()
    time.sleep(3)
    results = {}
    t_start = time.time()
    threads = [threading.Thread(target=run_workload, args=(p, a.workload, a.rows, results)) for p in pods.values()]
    [t.start() for t in threads]
    [t.join() for t in threads]
    t_end = time.time()
    time.sleep(3)
    sampler.stop()
    after = cg_snapshot(uids.values())

    per, total_peak = summarise(sampler.rows, uids.values(), t_start, t_end)
    report["run_wall_s"] = round(t_end - t_start, 1)
    report["sum_of_concurrent_mem_peak_mib"] = total_peak
    report["pods"] = {}
    for p, u in uids.items():
        report["pods"][p] = dict(
            idle_current_mib=round(idle[u]["current"] / 2**20),
            idle_anon_mib=round(idle[u]["anon"] / 2**20),
            cgroup_peak_mib=round(after[u]["peak"] / 2**20),
            sampled=per.get(u),
            result=results.get(p),
        )
    out = a.out or f"loadtest-{a.pool}-{a.workload}-{a.n}.json"
    with open(out, "w") as f:
        json.dump(report, f, indent=1)

    print(f"pool={a.pool} n={a.n} workload={a.workload} ready+serving={report['all_ready_and_serving_s']}s run={report['run_wall_s']}s")
    print(f"sum of concurrent memory at peak instant: {total_peak} MiB")
    for p, d in report["pods"].items():
        r = d["result"] or {}
        print(f"  {p}: idle {d['idle_current_mib']} MiB (anon {d['idle_anon_mib']}), cgroup peak {d['cgroup_peak_mib']} MiB, "
              f"sampled max {d['sampled']['max_mem_mib']} MiB, cpu avg {d['sampled']['avg_cores']} max {d['sampled']['max_cores']} cores, "
              f"wall {r.get('wall_s')}s {'ERR '+r.get('error','')[:120] if 'error' in r else ''}")
    print("report:", out)
    if not a.keep:
        kubectl("delete sandboxclaim " + " ".join(names) + " --wait=false")


if __name__ == "__main__":
    main()
