"""Deterministic sandbox workload (no LLM). Run inside a sandbox:

    kubectl exec -i <pod> -- python3 - < scripts/bench/workload.py

Prints one JSON object of step timings. Steps mimic what the agent does for a
user (mgd search/download, pandas analysis) plus micro-benchmarks that expose
runtime overhead (syscalls, process spawn, file I/O, loopback and cluster
networking). Rows default to 5,000,000 (~135 MB CSV); override with BENCH_ROWS.
"""
import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request

ROWS = int(os.environ.get("BENCH_ROWS", "5000000"))
WS = os.environ.get("BENCH_DIR", "/data/workspace/bench")
DIST_ID = os.environ.get(
    "BENCH_DIST", "dist-dga-4328a11d-775f-4530-8aae-e0c5b19d1a1b"
)
GATEWAY = os.environ.get("MGD_BASE_URL", "http://gateway.magda.svc.cluster.local/api")

results = {}


def step(name):
    def deco(fn):
        t0 = time.perf_counter()
        try:
            extra = fn()
            results[name] = {"s": round(time.perf_counter() - t0, 3)}
            if extra:
                results[name].update(extra)
        except Exception as e:  # keep going; report the failure
            results[name] = {"s": round(time.perf_counter() - t0, 3), "error": str(e)[:200]}
        return fn

    return deco


shutil.rmtree(WS, ignore_errors=True)
os.makedirs(WS, exist_ok=True)
os.chdir(WS)


@step("mgd_search")
def _():
    out = subprocess.run(
        ["mgd", "search", "datasets", "ocean", "--limit", "20", "--json"],
        check=True, capture_output=True, text=True,
    ).stdout
    return {"bytes": len(out)}


@step("mgd_download")
def _():
    subprocess.run(
        ["mgd", "dist", "download", DIST_ID, "-o", "dist.csv"],
        check=True, capture_output=True, text=True,
    )
    return {"bytes": os.path.getsize("dist.csv")}


@step("pandas_generate_csv")
def _():
    import numpy as np
    import pandas as pd

    rng = np.random.default_rng(42)
    df = pd.DataFrame(
        {
            "station": rng.integers(0, 500, ROWS),
            "day": rng.integers(0, 3650, ROWS),
            "temp": rng.normal(18, 6, ROWS).round(3),
            "salinity": rng.normal(35, 1.5, ROWS).round(3),
            "flag": rng.choice(["ok", "suspect", "bad"], ROWS),
        }
    )
    df.to_csv("synthetic.csv", index=False)
    return {"rows": ROWS, "bytes": os.path.getsize("synthetic.csv")}


@step("pandas_analyse")
def _():
    import pandas as pd

    df = pd.read_csv("synthetic.csv")
    g = df[df.flag == "ok"].groupby("station").agg(
        temp_mean=("temp", "mean"), temp_p95=("temp", lambda s: s.quantile(0.95)),
        sal_mean=("salinity", "mean"), n=("temp", "size"),
    )
    piv = df.pivot_table(index="station", columns="flag", values="temp", aggfunc="count")
    g.join(piv).to_csv("summary.csv")
    real = pd.read_csv("dist.csv")
    return {"groups": len(g), "real_rows": len(real)}


@step("cpu_python_loop")
def _():
    x = 0
    for i in range(20_000_000):
        x += i * i % 7
    return {"x": x % 1000}


@step("files_create_20k")
def _():
    os.makedirs("many", exist_ok=True)
    for i in range(20_000):
        with open(f"many/f{i}.txt", "w") as f:
            f.write("x" * 100)


@step("files_stat_walk")
def _():
    n = 0
    for _ in range(5):
        for root, _d, files in os.walk("many"):
            for fn in files:
                os.stat(os.path.join(root, fn))
                n += 1
    return {"stats": n}


@step("files_delete_20k")
def _():
    shutil.rmtree("many")


@step("disk_write_read_512MB")
def _():
    block = os.urandom(1 << 20)
    with open("big.bin", "wb") as f:
        for _ in range(512):
            f.write(block)
        f.flush()
        os.fsync(f.fileno())
    with open("big.bin", "rb") as f:
        while f.read(1 << 20):
            pass
    os.remove("big.bin")


@step("spawn_500_processes")
def _():
    for _ in range(500):
        subprocess.run(["/bin/true"], check=True)


@step("syscalls_getpid_1M")
def _():
    for _ in range(1_000_000):
        os.getppid()


@step("loopback_tcp_1k_conns")
def _():
    srv = socket.socket()
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(("127.0.0.1", 0))
    srv.listen(128)
    port = srv.getsockname()[1]
    import threading

    def serve():
        for _ in range(1000):
            c, _a = srv.accept()
            c.sendall(c.recv(64))
            c.close()

    t = threading.Thread(target=serve)
    t.start()
    for _ in range(1000):
        s = socket.create_connection(("127.0.0.1", port))
        s.sendall(b"ping")
        s.recv(64)
        s.close()
    t.join()
    srv.close()


@step("gateway_http_200_requests")
def _():
    url = GATEWAY.rstrip("/") + "/v0/registry/records?limit=1"
    for _ in range(200):
        with urllib.request.urlopen(url, timeout=10) as r:
            r.read()


shutil.rmtree(WS, ignore_errors=True)
results["total_s"] = round(sum(v["s"] for v in results.values() if isinstance(v, dict)), 3)
print(json.dumps(results))
