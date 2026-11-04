# ADR 0009: Isolated, on-demand Python dependencies in Agent Sandboxes

- **Status:** Accepted (merged #3896/#3898)
- **Date:** 2026-11-04 (documented after implementation)
- **Related:** [#3896](https://github.com/magda-io/magda/pull/3896), [#3898](https://github.com/magda-io/magda/pull/3898)

## Context

Scientific agent tasks need ML packages with variable versions. Baking every scientific stack into the runtime image increases image size and upgrade complexity, while global system Python modifications create inconsistent, hard-to-reproduce environments.

## Decision

Keep Debian system Python with minimal base tools, add pinned multi-architecture `uv` and pip/venv compatibility fallback, and create **purpose-specific** environments only as needed inside the per-user, DSH-writable PVC tree. Direct uv to the system Python without downloading a managed interpreter, and route package caches/build temporaries to PVC-backed paths, not Kubernetes ephemeral storage or forbidden filesystem locations.

Image-bundled `python-dependencies` guidance explains environment discovery, compatible versions, package provenance, resource limits and asking for user approval; **this approval is behavioural guidance, not a separate execution gate**. New Sandbox PVC request defaults to 10 GiB. Expose configured and effective CPU/memory/PVC information with `magda-workspace-resources`, distinguishing requests from actual filesystem capacity.

## Consequences

- Users pay installation cost/storage for packages they actually need, and preserve environments through restart/resume.
- Reset/logout deliberately removes environments; users must retain requirements and version manifests externally for reproducibility.
- Arbitrary dependency installation has code execution and supply-chain risk; guidance alone does not enforce safe/approved packages.
- Existing PVCs are not automatically resized; `df /data` may reflect a hostpath filesystem rather than enforceable 10 GiB quota. ML parallelism should honor cgroup CPU limits.

## Alternatives considered

Prebundling all scientific packages, modifying system Python, Python interpreter auto-download, shared global environments and non-PVC temporary caches were rejected for compatibility, resource isolation or operational reasons.

## Verification

See [Workspace runtime](../architecture/agent-workspace.md#on-demand-python-environments-3896), [deployment guide](../agent-workspace-deployment.md#on-demand-python-environments-and-storage) and [runtime E2E](../e2e-test-cases/agent-workspace.md#on-demand-python-dependency-checks).
