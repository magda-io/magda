# Using Agent Workspace and Agent Skills

**Availability:** Agent Workspace and cross-user Agent Skills are implemented on MAGDA's **`next` development branch**, not necessarily in the latest released version. Your deployment must enable the feature and grant the relevant roles. See the [architecture overview](./architecture/agent-workspace.md) and [operator guide](./agent-workspace-deployment.md) for configuration and deployment safety.

## Understand the three kinds of skills

- **Built-in runtime skills** (for example `magda-mgd`, `capture-workflow`, `python-dependencies`, `magda-builtin-read-office-documents`) are installed with the Agent Runtime image. They help the agent discover MAGDA operations and safe procedures; they are not user publications.
- **Your user skills** are reviewed Markdown instructions and decision rules that you explicitly publish to the Registry-backed skill catalogue. They are visible and writable according to your MAGDA permissions.
- **Shared skills** are other users' readable publications. **Sharing is not installation**: you must explicitly install an eligible shared source into your own skill set; you do not inherit the publisher's dataset or model permissions.

## Open a Workspace

1. Sign in to a deployment where `global.agentWorkspace.enabled` is true and your account has `agentWorkspace/access` (the assignable **Agent Workspace Users** role is a common choice).
2. Under **Settings → Agent Workspace → Open Workspace**, start or resume your Workspace. Each user has one current Sandbox per MAGDA installation but can have multiple DSH conversations within it.
3. Ask a natural task such as "Find the relevant datasets and help me reconcile this month's figures." You do **not** have to mention `mgd`: the bundled agent guidance can teach the agent how to work with the catalogue.
4. Review assumptions, data provenance, outputs and changes. User-scoped MAGDA authorization still controls every dataset request. Treat agent-generated code and results as work to verify, not as guaranteed correct.

The Workspace keeps local files and DSH session history across browser refresh, suspend/resume and Pod replacement as long as its PVC remains. **Reset, terminate and logout deliberately destroy** its local Workspace and unpublished drafts. Publish important data/outputs to a suitable durable MAGDA dataset first.

## Ask about Word, PowerPoint and Excel files

Attach a `.docx`, `.pptx` or `.xlsx` file with the composer's **+** button (or drag it in) and ask about it, for example "What does the footnote on the salinity figure say?" or "What is the Summary total and its formula?". The agent reads the actual contents with the built-in Office reading skill, and you don't need to mention the skill or install anything. It can cite where it found each answer: paragraph, table, header or footer, footnote, slide, speaker notes, or sheet and cell.

- **Spreadsheets:** the agent distinguishes a cell's formula (`=SUM(B3:B5)`) from its **cached value**, the result your spreadsheet application last saved. If a file was saved without calculating a formula, the agent says so rather than inventing a value. Hidden sheets and slides are reported as hidden.
- **Updated files:** attach the new version again; each upload is kept separately, so say which version you mean if it matters.
- **Not supported:** legacy Word/Excel/PowerPoint 97–2003 files (`.doc`, `.xls`, `.ppt`), password-protected files and OpenDocument files. Save them as `.docx`, `.xlsx` or `.pptx` (without a password) and upload again; renaming a file doesn't convert it. Images inside documents are not read, only their alternative text.
- **Macros** in `.docm`, `.xlsm` or `.pptm` files are never run.

Uploaded files stay in your own Workspace and are read-only to the agent. Text inside a document is treated as content, not as instructions to the agent.

## Capture and publish reusable expertise

1. After solving a task together, ask: "Capture the process as a reusable Agent Skill, including the assumptions, exceptions, verification checks and questions to ask me next time."
2. Inspect the local draft: it should describe general steps and variables, not copy a transcript, paste secrets, or hard-code the last dataset ID and result. Ask the agent to revise the draft.
3. **Approve publication only once you are satisfied**. The agent's trusted publication tool will use an explicit Publish/Cancel question card unless it determines that you've already approved this reviewed draft in the conversation. **Chat-based approval is model-interpreted, not independently cryptographically verified**; be specific when you do or do not consent.
4. Find the resulting user publication under **Settings → Agent Workspace → Agent Skills**. You can inspect metadata, download the ZIP, or (with the right permission) replace a user skill with a reviewed ZIP. `mgd agent-skill` also supports explicit skill authoring, publishing, pulling and synchronization.
5. Start a **fresh** Workspace later and ask for the task again. The managed Workspace syncs eligible published skills during startup or recovery; if it reports a partial/failed sync, use **Retry / Re-check**. A force retry can overwrite local edits: inspect the warning.

A published skill is reusable Markdown guidance, **not model fine-tuning, permanent model memory, a saved complete chat or a guarantee of the correct answer**. Update/reapprove it as exceptions evolve.

## Share, install and fork a skill

1. If you own a skill and have typed update authority, use its **Share** control to give a colleague permission to read the source. This does **not** automatically provide the underlying data or grant any new model-resource access.
2. Your colleague opens **Settings → Agent Workspace → Shared Skills**, finds it in **All available**, and explicitly clicks **Install**. If its name conflicts with a local skill, select an available alias.
3. Start or re-check the colleague's Workspace to synchronize the installed copy. The agent uses the skill under **the colleague's MAGDA account and dataset permissions**.
4. If the publisher updates or revokes the source, the next authorized sync will reflect that change; already downloaded or locally edited copies may persist until reconciliation. An installation whose source becomes unavailable can still be uninstalled.
5. To take independent ownership of a modified installed copy, use the supported explicit fork workflow; do not assume editing and publishing modifies the original author’s skill.

The permission to view a skill, the permission to install it and the permission to read a dataset or model distribution are **three separate checks**.

## Models, data and Python packages

Skills can refer to independently versioned MAGDA **dataset distributions** containing trained models, preprocessing, requirements, schemas, evaluation and model cards. The current user needs separate access to those resources. Before running inference, verify approved model version, compatibility, input units and intended use. A scientific scenario prediction is conditional on specified assumptions, not a validated causal forecast.

Python environments can be created on demand inside a purpose-specific, PVC-backed working-tree location. The bundled guidance instructs the agent to check available packages and ask before installing anything; this is guidance and **not** an enforced execution-control mechanism. Installing third-party code has supply-chain risk; keep versions and trusted sources recorded. `magda-workspace-resources` helps distinguish the configured resources from cgroup CPU/memory and observed filesystem capacity. The default new Workspace PVC request (10 GiB on `next`) is not an assurance that every StorageClass enforces that limit.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Open Workspace missing or 403 | Feature flag, signed-in session and `agentWorkspace/access` assignment |
| Skill catalogue empty | Own versus system filter, typed source-read rights, READY publication status |
| Shared skill visible but not used | Explicit installation, resolved source read, name/alias conflict, Workspace Retry/Re-check |
| Partial sync / local modification | Compare local edits with published source; avoid force until happy to discard differences |
| Skill or data read denied after sharing | Source permission and **independent dataset/distribution authorization** |
| Python package missing | Check the per-purpose environment and dependency manifest; request a reviewed installation |
| Old session or draft disappeared | Reset/termination/logout intentionally removed the user's PVC-backed local state |
| GKE deployment security uncertain | Do not run untrusted workloads until effective NetworkPolicy and Workload Identity/IAM checks pass |

If the problem is reproducible, report the deployment/runtime version, the expected and observed result, and sanitized error status without exposing keys, private account data or unapproved datasets.

For maintainers: [Agent Skills architecture](./architecture/agent-skills.md), [Skill sharing security](./architecture/agent-skills-authorization.md), [synchronization](./architecture/agent-skills-sync.md) and [test cases](./e2e-test-cases/README.md).
