# Open questions and evolving design queue

**Status:** Continuously maintained under #3811

This file is a place to make uncertainty visible. It is not a substitute for an owning detailed design ticket.

## Current dependency-critical work

- #3822 — sandbox runtime + session lifecycle;
- #3823 — Agent Manager control-plane contract;
- #3824 — DSH integration / bridge / browser routing;
- #3825 — delegated authentication / credential boundaries.

## Known questions inherited from the initial architecture sketch

- Exact DSH hook/patch used to deliver launch/auth material to the bridge without logging it.
- Whether the bridge-sidecar design is the smallest correct DSH connectivity boundary.
- Exact external-data egress technology for each supported production provider.
- Exact delegated Magda credential mechanism and revocation semantics.
- Initial workspace durability requirement: persistent PVC vs disposable/ephemeral workspace by profile.
- Exact server-enforced mutation-grant shape for multi-request `mgd` commands.
- Model-provider adapters beyond the first OpenAI-compatible path.
- Final skill storage/versioning/materialisation model.
- Production qualification criteria for AKS/Kata.
- Whether later EKS/Fargate support is viable (#3821).

## Likely later design areas

Create tickets only when prerequisites are mature enough for the question to be concrete:

- network/security enforcement;
- persistence/recovery, if #3822 shows it needs a distinct design;
- mutation approval;
- user/global skills;
- web/product UX;
- deployment/Helm/provider qualification;
- observability/audit;
- WebGPU migration/deprecation.

This list can change. If a current design reveals a better decomposition, update this file, #3811 and the overview.
