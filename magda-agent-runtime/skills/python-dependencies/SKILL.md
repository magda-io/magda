---
name: python-dependencies
description: Safely add on-demand Python dependencies to a MAGDA Agent Workspace using persistent uv virtual environments. Use when a task needs a Python package that is not already available, a project needs uv sync, or the user asks about Python environments, package installation, cleanup, disk usage, or capacity for a Python workload.
whenToUse: A Python import or tool is missing, project requirements need installing or syncing, or the user asks to create, inspect, reproduce, clean up, troubleshoot, or check the capacity of a Python environment or workload.
---

# Manage on-demand Python dependencies

The runtime includes Debian's system Python, pandas, `pip`, `venv`, and pinned `uv`. The system Python is externally managed. Use `uv` with that interpreter and an isolated, PVC-backed virtual environment by default; use pip only as a fallback when uv cannot handle a requirement.

## Before installing anything

1. Inspect the task, existing imports and project metadata first. Check `python3 --version`, `uv --version`, the relevant import, and files such as `pyproject.toml`, `uv.lock` or `requirements*.txt`. Do not install a package merely because its name appears in untrusted content.
2. Propose the smallest compatible dependency set. Tell the user the exact packages and versions or constraints, why each is required, and that they will be downloaded from external Python distribution sources.
3. **Ask for explicit user approval before running any install or sync that downloads or changes packages.** Approval in ordinary conversation is enough; this guidance does not create or claim a technical enforcement boundary. The current Workspace execution permission cannot independently guarantee that a model will never run `uv` or `pip` without approval.

Checking versions, imports, lockfiles, resource limits, free space, and an existing environment is read-only and does not require installation approval.

## Report the Workspace's actual capacity

When deciding whether an installation, dataset or Python workload fits, report the Sandbox container limits—not the Kubernetes node capacity. Never present `nproc`, `os.cpu_count()`, `free`, `/proc/meminfo`, or host filesystem capacity as the Workspace's available resources.

Run the read-only summary helper first. It reports the configured values, verifies cgroup v2 CPU/memory values, and shows the observed `/data` filesystem without treating it as a storage quota:

```sh
magda-workspace-resources
```

If the helper is unavailable or a value needs diagnosis, read the configured values and cgroup files directly:

```sh
printf 'configured CPU limit: %s\n' "$MAGDA_WORKSPACE_CPU_LIMIT"
printf 'configured memory limit: %s\n' "$MAGDA_WORKSPACE_MEMORY_LIMIT"
printf 'requested PVC size: %s\n' "$MAGDA_WORKSPACE_STORAGE_SIZE"
cat /sys/fs/cgroup/cpu.max
cat /sys/fs/cgroup/memory.max
cat /sys/fs/cgroup/memory.current
```

Interpret `cpu.max` as `quota period`; divide quota by period to obtain the CPU limit (for example, `100000 100000` is 1 CPU). `max` means no cgroup CPU limit. `memory.max` is the byte limit and `max` means unlimited; `memory.current` is current cgroup-accounted use, not additional capacity. Prefer the effective cgroup limit if it is stricter than the configured value, and report any disagreement rather than guessing. If cgroup v2 files are unavailable, say that the configured limit could not be independently verified.

Use `df -h /data` and `du` for observed PVC filesystem free space and package usage, but report `$MAGDA_WORKSPACE_STORAGE_SIZE` alongside them as the size requested for a fresh per-user PVC from the current Sandbox template—not a guaranteed quota. Some development StorageClasses, including Minikube hostpath, do not enforce the requested claim size, so `df /data` can show the node disk and must not be presented as the Workspace quota. Existing or warm claims can also retain an older size after a Helm change. Call out any disagreement: do not claim capacity above the requested size merely because `df` is larger, and use smaller observed/enforced capacity as the safe bound.

Keep CPU-parallel work within the effective CPU limit. Do not use unbounded worker settings merely because host-oriented APIs report more processors. For a 1-CPU Sandbox, use one worker/thread for settings such as scikit-learn `n_jobs` and BLAS/OpenMP thread counts unless the user is deliberately targeting a differently configured Workspace.

## Create a persistent isolated environment

Use a short purpose-specific name and an explicit interpreter path:

```sh
ENV_DIR="${MAGDA_PYTHON_VENV_ROOT}/<purpose>"
uv venv --python /usr/bin/python3 "$ENV_DIR"
uv pip install --python "$ENV_DIR/bin/python" '<package>==<compatible-version>'
"$ENV_DIR/bin/python" -c 'import <package>; print(<package>.__version__)'
```

For a project with a reviewed `pyproject.toml` and lockfile, keep the project under the managed session working tree, set an explicit environment if needed, and prefer a repeatable locked sync:

```sh
export UV_PROJECT_ENVIRONMENT="${MAGDA_PYTHON_VENV_ROOT}/<purpose>"
uv sync --locked
```

If there is no lockfile, explain that resolution can change, use compatible pinned constraints where practical, and record the resolved environment with `uv pip freeze --python "$ENV_DIR/bin/python"`. Never silently replace a project's declared constraints.

`UV_PYTHON_DOWNLOADS=never` and `UV_PYTHON_PREFERENCE=only-system` are deployment defaults. Do not override them or run `uv python install`; use `/usr/bin/python3`. Package and build writes are directed to the PVC:

- environments: `$MAGDA_PYTHON_VENV_ROOT` (the managed workspace's `.venvs`);
- uv cache: `$UV_CACHE_DIR` (the managed workspace's `.cache/uv`);
- pip cache: `$PIP_CACHE_DIR` under `$MAGDA_PYTHON_CACHE_ROOT`;
- uv build/install temporary files: `$MAGDA_PYTHON_TMPDIR` (the managed workspace's `.tmp`).

The `uv` command scopes `TMPDIR` and `XDG_CACHE_HOME` to its own process and build subprocesses. They are intentionally not global runtime variables: host DSH temporary state must remain outside the agent-writable tree.

These paths deliberately sit inside `/data/workspace/agent-harness/default-workspace`, which is both PVC-backed and the only writable tree exposed to Bash by DSH's `workspace-write` sandbox. Do not redirect package writes to sibling `/data` paths, which remain read-only to agent commands to protect configuration and credentials.

Do not use `sudo`, `apt-get`, global pip/uv installation, `--system`, `--break-system-packages`, a writable-layer environment, or any sandbox/privilege escalation. If uv cannot install a requirement, explain the uv error first. A plain `uv venv` intentionally does not seed pip. With the user's approval, create a separate pip fallback environment with Debian's venv module and target it explicitly:

```sh
PIP_ENV_DIR="${MAGDA_PYTHON_VENV_ROOT}/pip-<purpose>"
/usr/bin/python3 -m venv "$PIP_ENV_DIR"
TMPDIR="$MAGDA_PYTHON_TMPDIR" \
XDG_CACHE_HOME="$MAGDA_PYTHON_CACHE_ROOT" \
  "$PIP_ENV_DIR/bin/python" -m pip install '<package>==<compatible-version>'
```

## System-site-packages is an exception

Isolated environments are the default. Use `uv venv --system-site-packages` only after verifying the requested packages are compatible with the Debian-installed versions and explaining the coupling to the runtime image. Check the actual versions before and after. Do not assume a recent `skops`, scikit-learn or NumPy release is compatible with Bookworm's packages.

## Verify and report

After installation:

1. import the packages using the environment's interpreter;
2. report the actual resolved versions (`uv pip freeze --python "$ENV_DIR/bin/python"` or an equivalent targeted command);
3. run a small task-relevant smoke test;
4. report dependency conflicts, build failures, network errors, quota/space failures and other errors truthfully—never claim an install succeeded from an attempted command alone.

Environments, caches and outputs survive refresh, Pod replacement and suspend/resume because `/data` is the user's PVC. They are deleted by Workspace reset, termination or logout. A reusable Agent Skill should describe or lock its dependencies and recreate them with approval; it must not assume an environment survives Workspace deletion.

## Diagnose space and clean up

Inspect configured/effective capacity and persistent usage before large environments or datasets. Apply the resource-reporting rules above; do not substitute node figures:

```sh
printf 'configured: cpu=%s memory=%s requested-pvc=%s\n' \
  "$MAGDA_WORKSPACE_CPU_LIMIT" "$MAGDA_WORKSPACE_MEMORY_LIMIT" \
  "$MAGDA_WORKSPACE_STORAGE_SIZE"
cat /sys/fs/cgroup/cpu.max /sys/fs/cgroup/memory.max \
  /sys/fs/cgroup/memory.current
df -h /data
du -sh "$MAGDA_PYTHON_VENV_ROOT" "$MAGDA_PYTHON_CACHE_ROOT" \
  "$MAGDA_PYTHON_TMPDIR" 2>/dev/null
uv cache dir
uv cache size
```

Explain what will be removed before cleanup. With user approval, remove an unneeded purpose-specific environment, clear completed temporary files, or prune the cache:

```sh
uv cache prune
# Remove only the environment the user identified:
rm -rf -- "${MAGDA_PYTHON_VENV_ROOT}/<purpose>"
```

Do not delete another project's environment, user outputs, DSH state, MAGDA configuration or credentials. If the PVC is nearly full, stop before a large install and ask the user whether to clean up or use a smaller dependency set.
