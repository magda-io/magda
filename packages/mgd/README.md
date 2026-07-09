# @magda/mgd — MAGDA Command-Line Interface

`mgd` is the local command-line interface for the
[MAGDA](https://github.com/magda-io/magda) data catalog platform, developed as
part of [epic #3648](https://github.com/magda-io/magda/issues/3648). It lets you
work with a MAGDA catalog from your terminal — or from an AI coding assistant —
without cloning the repository or running anything inside the cluster. With it
you can:

- authenticate with an API key and manage multiple site profiles;
- search the catalog by keyword or semantic similarity;
- inspect and download datasets, distributions and files (including large ones);
- create and edit dataset records, upload files, and manage custom aspects;
- call any MAGDA REST endpoint directly.

`mgd` is designed to be **script- and agent-friendly**: results go to stdout,
progress/diagnostics go to stderr, machine output is available via `--json` /
`--jsonl`, and it uses stable exit codes. It ships with an assistant "skill" so
coding agents such as Claude Code can drive it — see
[Using `mgd` with a coding agent](#using-mgd-with-a-coding-agent).

> See also: [How to create an API key](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-create-api-key.md).

## Installation

`mgd` requires **Node.js ≥ 22**. Install it globally so the `mgd` command is on
your `PATH`:

```sh
npm install -g @magda/mgd
mgd --version
```

Or run it without installing:

```sh
npx @magda/mgd <command>
```

The package is self-contained (one runtime dependency) and ships the assistant
skill files under [`skills/`](./skills/).

## Quick start

```sh
# 1. Log in (prompts for site URL, API key ID and key; or pass them as flags)
mgd auth login

# 2. Confirm who you are and where
mgd auth status

# 3. Search
mgd search datasets "climate temperature"
mgd search semantic "rainfall impact on crop yield"    # if semantic search is available

# 4. Inspect and download
mgd dataset get magda-ds-<uuid>
mgd dataset distributions magda-ds-<uuid> --jsonl
mgd dist download magda-dist-<uuid> -o data.csv
```

## Authentication and profiles

### Logging in

Create an API key in the MAGDA web UI first
([**Settings → API Keys**](https://github.com/magda-io/magda/blob/main/docs/docs/how-to-create-api-key.md)),
then:

```sh
mgd auth login
# or non-interactively:
mgd auth login --url https://dev.magda.io --key-id <id> --key <key> --profile default
```

- `--url` accepts either a **site URL** (`https://dev.magda.io`) or a full **API
  base URL** — `mgd` normalises it by probing `<url>/api/v0` then `<url>/v0`, so
  non-standard gateway mounts work.
- Credentials are verified against the API before being saved.
- Leave the API key ID empty to configure **anonymous** access (MAGDA supports
  anonymous read access to public data).

### Profiles

Credentials are stored per named profile in `~/.config/mgd/config.json`
(respecting `$XDG_CONFIG_HOME`), with restrictive permissions (`0600` file,
`0700` directory). The default profile is named `default`.

```sh
mgd auth login --profile prod --url https://prod.example.com   # add a profile
mgd profile list                                               # list profiles
mgd profile use prod                                           # switch active profile
mgd auth status                                                # who am I, where
mgd auth logout                                                # clear active profile creds
```

`mgd auth status` reports the active profile, base URL and the identity returned
by the server; it shows `anonymous` when no credentials are configured.

### Environment variables (CI / agents)

Environment variables override the stored profile and are ideal for CI or
ephemeral containers. When all three of `MGD_BASE_URL`, `MGD_API_KEY_ID` and
`MGD_API_KEY` are set, **no config file is read or written**:

| Variable         | Purpose                                     |
| ---------------- | ------------------------------------------- |
| `MGD_BASE_URL`   | Site or API base URL                        |
| `MGD_API_KEY_ID` | API key ID                                  |
| `MGD_API_KEY`    | API key value                               |
| `MGD_PROFILE`    | Select a stored profile by name             |
| `NO_COLOR`       | Disable ANSI colour (also via `--no-color`) |

```sh
export MGD_BASE_URL="https://dev.magda.io/api"
export MGD_API_KEY_ID="…"
export MGD_API_KEY="…"
mgd auth status
```

## Output modes, scripting and exit codes

- **stdout** carries the result; **stderr** carries progress, warnings and error
  details. Suppress diagnostics with `2>/dev/null`.
- `--json` prints one pretty JSON document. `--jsonl` prints one JSON object per
  line for list results — ideal for streaming into `jq`, `grep`, `xargs`, etc.
- In `--json`/`--jsonl` mode, errors are emitted to stderr as a structured object
  `{"error":{"code","message","status","hint"}}` so agents can parse failures.

```sh
# titles of the first 20 datasets matching a query
mgd search datasets "water quality" --limit 20 --jsonl | jq -r '.title'
```

### Exit codes

| Code | Meaning                                            |
| ---- | -------------------------------------------------- |
| `0`  | Success                                            |
| `1`  | General runtime / API error                        |
| `2`  | Usage error (bad argument, flag or env var)        |
| `3`  | Authentication error (missing/invalid credentials) |
| `4`  | Not found (record or object does not exist)        |

## Searching the catalog

MAGDA offers two complementary search modes:

```sh
# Keyword / faceted search — best for known terms, filters, pagination
mgd search datasets "rainfall" --limit 10 --offset 0

# Semantic (embedding) search — best for conceptual, natural-language queries
mgd search semantic "impact of drought on crop yield"
```

Use keyword search when you know the vocabulary; use semantic search when the
wording differs from the dataset's metadata. Semantic search requires a
deployment with the semantic-search components installed — on sites without it,
`mgd search semantic` returns a clear `semantic-search-unavailable` error (a
non-zero exit) rather than failing silently, so you can fall back to keyword
search. A useful recipe is to run both with `--jsonl` and merge/de-duplicate by
dataset ID.

## Inspecting datasets and distributions

```sh
mgd dataset get magda-ds-<uuid>                       # dataset record
mgd dataset get magda-ds-<uuid> --json                # full record as JSON
mgd dataset distributions magda-ds-<uuid> --jsonl     # its distributions
mgd dist get magda-dist-<uuid> --json                 # a single distribution
```

Distribution records carry metadata under aspects such as
`dcat-distribution-strings` (title, format, `downloadURL`/`accessURL`). Use
`--jsonl` + `jq` to pull out just the fields you need.

## Downloading data

```sh
mgd dist download magda-dist-<uuid> -o data.csv         # to a file
mgd dist download magda-dist-<uuid> -o - | head         # stream to stdout
mgd file download magda-datasets/<datasetId>/<distId>/<fileName> -o data.csv   # by bucket/key
```

`mgd dist download` resolves the distribution's `downloadURL`: MAGDA-hosted
`magda://storage-api/…` URLs are fetched through the gateway (with your
credentials); plain `http(s)://` URLs are fetched directly (no MAGDA auth headers
sent to third-party hosts). For large files, downloads use HTTP **Range**
requests and support `--resume` to continue an interrupted transfer:

```sh
mgd dist download magda-dist-<uuid> -o big.tif --resume
```

## Creating and editing datasets

`mgd` reproduces the same end-state record operations as the web "Add Dataset"
wizard, so datasets you create or edit with the CLI remain fully editable in the
web UI. New datasets are created as **drafts** unless you pass `--publish`.

```sh
# 1. Create a draft dataset
mgd dataset create \
  --title "River gauge readings 2025" \
  --desc "Daily river height and flow measurements." \
  --json                                              # -> magda-ds-<uuid>

# 2. Upload a file and attach it as a distribution
mgd dataset add-file magda-ds-<uuid> ./readings.csv --title "2025 readings" --format csv

# 3. Register a link-only distribution (no upload)
mgd dataset add-file magda-ds-<uuid> --access-url https://example.org/data.csv --title "Source data"

# 4. Update metadata
mgd dataset update magda-ds-<uuid> --title "River gauge readings (2025, v2)"

# 5. Replace the file behind a distribution (adds a new version entry)
mgd dist replace-file magda-dist-<uuid> ./readings-corrected.csv
```

Datasets created by the CLI are stamped with a `source` aspect
(`{"id":"magda","name":"Magda CLI (mgd)","type":"internal","url":<site>}`) — the
same `id` the web client uses, so they show up as editable records in the web
metadata tools, with a distinct `name` marking their CLI provenance.

> **Publishing is a deliberate step.** Create as a draft, review, then publish
> explicitly. `add-file` / `replace-file` are multi-step operations; if a step
> fails after the upload, `mgd` rolls back the uploaded object where it can and
> prints the exact commands to finish or undo — it never leaves silent partial
> state.

### Custom aspects

The registry supports user-defined aspects with JSON-schema validation. `mgd`
exposes them (the web UI does not):

```sh
# aspect definitions
mgd aspect list
mgd aspect get <aspectId>
mgd aspect create <aspectId> --name "My Aspect" --schema @schema.json

# aspect data on any record (dataset or distribution)
mgd dataset aspect get    magda-ds-<uuid> <aspectId>
mgd dataset aspect set    magda-ds-<uuid> <aspectId> @data.json    # inline JSON, @file, or - for stdin
mgd dataset aspect delete magda-ds-<uuid> <aspectId>
```

Every mutation command also accepts repeatable `--aspect <id>=<json|@file|->` to
attach custom aspect data at create/update time.

## Uploading files directly to storage

```sh
mgd file upload ./big.tif --bucket magda-datasets --key path/to/big.tif --record-id magda-ds-<uuid>
```

Files **at or above 16 MB** automatically use resumable **multipart** upload (one
bounded part at a time, constant memory); smaller files use a single request.
Multipart needs a deployment that exposes the multipart storage endpoints
(`/v0/storage/multipart/{initiate,part,complete,abort}`); older deployments fall
back to single-shot upload automatically (`--single-shot` forces it). Pass
`--record-id <datasetId>` so record-linked storage authorization applies.

## Raw API access

For endpoints without a curated command, call the REST API directly — with your
credentials and structured error handling:

```sh
mgd api request GET /v0/registry/records/<id> --query aspect=dcat-dataset-strings --json
mgd api request POST /v0/registry/records --body-file record.json
echo '{"active":true}' | mgd api request PUT /v0/some/endpoint --body -
```

## Command reference

| Command                                               | Description                                      |
| ----------------------------------------------------- | ------------------------------------------------ |
| `auth login` / `auth status` / `auth logout`          | Manage credentials for a site profile            |
| `profile list` / `profile use <name>`                 | List / switch profiles                           |
| `search datasets <query>`                             | Keyword dataset search                           |
| `search semantic <query>`                             | Semantic (embedding) search                      |
| `dataset get <id>`                                    | Fetch a dataset record                           |
| `dataset distributions <id>`                          | List a dataset's distributions                   |
| `dataset create`                                      | Create a dataset (draft by default)              |
| `dataset update <id>`                                 | Update dataset metadata                          |
| `dataset add-file <id> [file]`                        | Upload/attach a distribution (or `--access-url`) |
| `dataset aspect get/set/delete <recordId> <aspectId>` | Read/write custom aspect data on any record      |
| `dist get <id>` / `dist update <id>`                  | Inspect / edit a distribution                    |
| `dist download <id>`                                  | Download a distribution's file (`--resume`)      |
| `dist replace-file <id> <file>`                       | Replace a distribution's file, bump version      |
| `file upload <file>` / `file download <bucket/key>`   | Direct storage transfer                          |
| `aspect list` / `get <id>` / `create <id>`            | Manage aspect definitions                        |
| `api request <method> <path>`                         | Call any MAGDA API endpoint                      |

Run `mgd --help` or `mgd <command> --help` for full option documentation.

## Using `mgd` with a coding agent

`mgd` ships with a tool-agnostic assistant **skill** so an LLM coding agent can
drive the catalog safely. The [`skills/`](./skills/) folder contains:

- **`mgd-workflows.md`** — command usage, output modes, search strategy, recipes,
  safety rules and error triage;
- **`dataset-elicitation.md`** — "metadata consultant" behaviour for guided
  dataset creation (infer before asking, quick vs guided path, confirm-then-write);
- **`SKILL.md`** — the entry point declaring the `magda-mgd` skill (name +
  description frontmatter that points at the two files above).

For a globally installed CLI the files live at
`$(npm root -g)/@magda/mgd/skills/`. In every case, make sure `mgd` is on the
agent's `PATH` and that credentials are configured (a saved profile, or the
`MGD_*` environment variables) before starting the agent.

### Claude Code

Claude Code auto-discovers skills under a project's `.claude/skills/` directory.
Copy the skill in:

```sh
mkdir -p .claude/skills/magda-mgd
cp "$(npm root -g)/@magda/mgd/skills/"*.md .claude/skills/magda-mgd/
```

Start `claude` in that project and it can invoke the `magda-mgd` skill on demand.
(For a personal, all-projects install, use `~/.claude/skills/magda-mgd/` instead.)

### Codex

Codex reads project instructions from an `AGENTS.md` file. Vendor the skill into
your repo and point `AGENTS.md` at it so Codex loads the workflow rules as
context:

```sh
mkdir -p .agent/magda-mgd
cp "$(npm root -g)/@magda/mgd/skills/"{mgd-workflows.md,dataset-elicitation.md} .agent/magda-mgd/
```

```markdown
<!-- AGENTS.md -->

## MAGDA `mgd` CLI

When working with a MAGDA catalog, use the `mgd` CLI and follow
`.agent/magda-mgd/mgd-workflows.md`. When creating or editing datasets, also
follow `.agent/magda-mgd/dataset-elicitation.md`. Always use `--json`/`--jsonl`
when parsing output and rely on the documented exit codes.
```

### opencode

opencode also reads an `AGENTS.md` rules file (and honours nested ones). Use the
same vendoring approach as Codex above — copy `mgd-workflows.md` and
`dataset-elicitation.md` into the repo and reference them from `AGENTS.md`.
opencode will pick up the instructions and, with `mgd` on `PATH` and credentials
set, can run the same discovery → analyse → publish workflows.

> The canonical instructions are deliberately tool-agnostic, so any assistant
> that loads a Markdown instructions/rules file can use them — the sections above
> just show the idiomatic place to point each tool.

## Troubleshooting

- **`Authentication error` (exit 3)** — no or invalid credentials. Re-run
  `mgd auth login`, or check `MGD_API_KEY_ID` / `MGD_API_KEY`.
- **`semantic-search-unavailable` (exit 1)** — the target site doesn't have the
  semantic-search components installed; use `mgd search datasets` instead.
- **`Not found` (exit 4)** — the record or storage object doesn't exist (or your
  key can't see it).
- **A large upload is rejected** — the deployment may lack the multipart storage
  endpoints and hit an ingress body-size limit on single-shot upload; upload
  against a deployment with multipart support.
- **Parsing output in scripts** — always pass `--json` / `--jsonl` and rely on
  the documented exit codes rather than scraping human-readable text.

## Development

This package lives in the `packages/mgd/` subdirectory of the Magda monorepo.

```sh
yarn build       # TypeScript → ESM via esbuild, output to bin/
yarn test        # unit tests (Mocha + tsx)
yarn typecheck   # type-check without emitting
```

Node.js ≥ 22 is required (set in `engines` in `package.json`).

## License

Apache 2.0
</content>
