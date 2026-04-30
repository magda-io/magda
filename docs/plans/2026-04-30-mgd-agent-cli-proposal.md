# MGD Agent CLI Proposal

Date: 2026-04-30

## Summary

MAGDA should provide a small, scriptable CLI named `mgd` as the primary interface for local code-agent workflows. Instead of running expensive, long-lived, sandbox-sensitive agents inside the MAGDA cluster or serving every analysis workflow through the web UI, users would authenticate locally and let agents such as Codex and Claude Code interact with MAGDA through `mgd`.

The CLI should expose curated high-level commands for common MAGDA workflows while preserving full API reach through a raw request fallback. MAGDA should also ship agent skills that teach code agents how to use `mgd` safely and effectively.

## Context

The current `next` branch already contains several pieces that make this direction practical:

- The web client includes a browser chatbot, WebLLM integration, tool-calling code, chart rendering, SQL query execution, and dataset search tools.
- The hybrid search and semantic search stack exposes dataset search, semantic retrieval, and semantic indexer framework packages.
- MAGDA already has broad REST API coverage with generated API documentation under `/api/v0/apidocs/index.html`.
- API keys already exist, can be managed through user APIs, and can be supplied via `X-Magda-API-Key-Id`/`X-Magda-API-Key` headers or bearer auth.
- Existing TypeScript packages such as registry and auth API clients can be reused where appropriate.

The difficult parts of the current server/web-agent direction are operational rather than conceptual: cluster sandboxing, scaling cost, long-running web interactions, rich output rendering, and large file handling. Moving agent execution to the user's machine avoids most of those costs while keeping MAGDA as the trusted data catalog, auth, search, storage, and metadata system.

## Goals

- Let users run code agents locally while accessing MAGDA data and metadata through a supported interface.
- Make common workflows easy for both humans and agents.
- Keep the CLI composable with normal Unix tools such as `grep`, `sed`, `awk`, `jq`, `cat`, `ls`, `find`, `xargs`, and shell pipelines.
- Use MAGDA's existing REST APIs and API-key model rather than introducing a new agent server protocol.
- Provide an agent skill design for Codex and Claude Code.
- Support large-file workflows by streaming files to local disk instead of pushing all analysis through the browser or server.

## Non-Goals

- Do not introduce MCP in this proposal.
- Do not run arbitrary user agents inside the MAGDA cluster.
- Do not replace the existing MAGDA web UI, chatbot, SQL console, or API docs.
- Do not require every REST endpoint to have a polished high-level command in the first release.

## Recommended Approach

Build `mgd` with two command layers:

1. Curated workflow commands for common agent and user tasks.
2. A raw API fallback for complete REST API reach.

This avoids the extremes of a fully generated CLI, which would expose too much REST shape to users, and an overly narrow workflow CLI, which would block agents when they need an endpoint not yet modeled.

## CLI Principles

`mgd` should behave like a good Unix command:

- Write primary output to stdout and diagnostics/progress to stderr.
- Support `--json` for structured output on every read command.
- Support newline-delimited JSON with `--jsonl` for result lists and streaming events.
- Support plain ID output with `--id-only` or equivalent flags for shell composition.
- Accept file input through `--file`, `--body-file`, and stdin where sensible.
- Avoid interactive prompts when `--no-input`, `CI=true`, or stdin is not a TTY.
- Use stable exit codes: success, user/input error, auth error, permission error, not found, conflict, remote service error, network error, and partial transfer.
- Keep output stable enough for scripts and agents to parse.
- Provide `--quiet`, `--verbose`, and `--debug` modes.
- Make pagination explicit and scriptable through `--limit`, `--page-token`, `--all`, and JSON fields such as `nextPageToken`.
- Stream large downloads/uploads rather than buffering full files in memory.
- Preserve filenames safely and print created file paths in machine-readable form.

Example shell-friendly flows:

```bash
mgd search datasets "water quality" --limit 20 --json \
  | jq -r '.dataSets[].identifier'

mgd dataset distributions dataset-123 --jsonl \
  | jq -r 'select(.format == "CSV") | .identifier' \
  | xargs -n1 mgd file download --output ./data

mgd api request GET /v0/registry/records \
  --query aspect=dcat-dataset-strings \
  --query limit=100 \
  --json \
  | jq '.records[] | {id, name}'
```

## Proposed Command Groups

### Auth and Profiles

Commands:

- `mgd auth login --site <url>`
- `mgd auth status`
- `mgd auth logout`
- `mgd profile list`
- `mgd profile use <name>`
- `mgd profile set <name> --site <url>`

The login flow should create or import a MAGDA API key and store it in the local OS credential store where possible. A file-based fallback should use strict permissions. The CLI should support multiple MAGDA sites through named profiles, similar to `gh` and `aws`.

### Search

Commands:

- `mgd search datasets <query>`
- `mgd search organisations <query>`
- `mgd search regions <query>`
- `mgd search facets`
- `mgd semantic search <query>`
- `mgd semantic retrieve <id...>`

Search commands should default to concise human-readable tables but support `--json`, `--jsonl`, `--limit`, `--all`, and filters such as publisher, format, region, and temporal range. Semantic commands should wrap the semantic search API where enabled.

### Dataset and Distribution Workflows

Commands:

- `mgd dataset get <dataset-id>`
- `mgd dataset distributions <dataset-id>`
- `mgd dataset create --file <metadata.json>`
- `mgd dataset update <dataset-id> --file <metadata.json>`
- `mgd dataset add-file <dataset-id> <path>`
- `mgd distribution get <distribution-id>`
- `mgd file download <distribution-id> --output <path>`

These commands should hide common registry dereferencing details and give agents a reliable way to move from a search result to metadata, distributions, and local files.

### Storage

Commands:

- `mgd storage ls <bucket> [prefix]`
- `mgd storage get <bucket> <path> --output <path>`
- `mgd storage put <bucket> <path> --file <local-path>`
- `mgd storage upload <local-path> --dataset <dataset-id>`

Large files should stream, show progress on stderr, and return final object metadata on stdout.

### Registry

Commands:

- `mgd record get <record-id>`
- `mgd record list --aspect <aspect-id>`
- `mgd record create --file <record.json>`
- `mgd record patch <record-id> --patch <patch.json>`
- `mgd aspect get <aspect-id>`
- `mgd aspect list`

Registry commands should expose enough power for advanced agents while keeping dangerous updates explicit.

### Raw API Fallback

Command:

- `mgd api request <METHOD> <PATH>`

Examples:

```bash
mgd api request GET /v0/registry/records --query aspect=dcat-dataset-strings --json
mgd api request POST /v0/auth/users/me/apiKeys --body-file ./request.json --json
```

The raw API command should handle base URL, profile auth, query encoding, request bodies, response headers, and error formatting. It gives agents access to documented APIs before a curated command exists.

## Agent Skill Design

MAGDA should ship at least two skill documents:

- `magda-mgd-codex`
- `magda-mgd-claude-code`

Both skills should teach the same operational model:

- Use `mgd auth status` first to confirm the active MAGDA site and identity.
- Prefer curated commands over `mgd api request`.
- Prefer `--json` or `--jsonl` when planning or parsing.
- Use `jq`, `grep`, `sed`, `awk`, `xargs`, `find`, `ls`, `cat`, and other standard shell tools to inspect and transform local outputs.
- Download source data to a local working directory before analysis.
- Keep generated analysis artifacts local until the user asks to upload or publish them.
- Ask before destructive or publishing operations such as deleting records, overwriting metadata, or uploading generated outputs to a shared dataset.
- Record command provenance in final answers: dataset IDs, distribution IDs, local file paths, and upload targets.
- Use `mgd api request` only when no curated command exists, and include the endpoint path in the explanation.

The skills should include common recipes:

- Search for datasets, select likely candidates, and inspect distributions.
- Download CSV/Excel/GeoJSON/PDF files and analyze them locally.
- Run semantic search and retrieve supporting chunks.
- Upload an analysis artifact and attach it to a dataset.
- Create or update a dataset from a local metadata JSON file.
- Diagnose auth, permission, and missing-data errors.

## Data Flow

1. User installs `mgd` and authenticates to a MAGDA site.
2. A local code agent invokes `mgd` to search for datasets and inspect metadata.
3. The agent downloads selected distributions through `mgd` to the local filesystem.
4. The agent analyzes files locally using its available tools and runtime.
5. The agent presents results to the user.
6. If requested, the agent uses `mgd` to upload files, create datasets, or update registry records.

MAGDA remains responsible for auth, authorization, metadata, search, storage, and auditability. The user's machine handles agent execution, local compute, temporary files, and rich artifact generation.

## Error Handling and Safety

`mgd` should make failures easy for agents to classify:

- Auth failures should suggest `mgd auth login` or `mgd profile use`.
- Permission failures should include the operation and target resource when available.
- Not-found errors should distinguish missing IDs from empty search results.
- Large transfer failures should leave partial files with clear naming and support retry or resume where practical.
- Mutating commands should support `--dry-run` where useful.
- Destructive commands should require `--yes` or `--force`.
- JSON errors should include fields such as `code`, `message`, `status`, `requestId`, and `details`.

## Testing Strategy

- Unit-test auth profile storage, URL handling, output formatting, pagination, and error mapping.
- Add contract tests for key commands against known MAGDA API fixtures.
- Add integration tests against a local or dev MAGDA deployment for auth, search, dataset retrieval, storage upload/download, and registry updates.
- Add golden-output tests for table, JSON, JSONL, and error formats.
- Add shell-composition tests that pipe `mgd` output through common commands such as `jq`, `grep`, `sed`, and `xargs`.
- Add agent skill smoke tests that validate a code agent can follow the documented workflow.

## Delivery Plan

Phase 1 should create the CLI foundation:

- Binary name `mgd`.
- Profile and auth support.
- Search, dataset get, distribution list, file download, and raw API request.
- JSON/JSONL output conventions.
- Initial Codex and Claude Code skill documents.

Phase 2 should add write workflows:

- Dataset create/update.
- Storage upload.
- Record create/patch.
- Safer dry-run and confirmation behavior.

Phase 3 should broaden coverage:

- Semantic search and retrieve commands.
- Better generated command coverage from API documentation where useful.
- Completion scripts, packaged installers, and expanded agent recipes.

## Open Questions

- Should `mgd auth login` create API keys through the authenticated web session, device-code style flow, or manual paste from the MAGDA UI in the first release?
- Which package manager and installer targets should be supported first: npm, Homebrew, standalone binaries, or all of them?
- Should semantic search commands be hidden or marked experimental when the semantic search API is not enabled on a target deployment?
- What audit metadata should `mgd` include on mutating operations to identify local agent usage?
