---
name: magda-mgd
description: Use when accessing a MAGDA data catalog from the command line — searching/downloading datasets, analysing them locally, or creating/editing dataset records and uploading files via the mgd CLI.
---

# Using the `mgd` CLI for MAGDA workflows

Instructions for assistant tools (and humans) driving a MAGDA data catalog
through the `mgd` command-line interface. Tool-agnostic: adapt the framing to
your assistant environment, keep the rules.

This file is the always-loaded **core**: ground rules, the command index, error
triage, and a router pointing at the reference file for your task. The detailed
recipes and their safety notes live in those reference files — **read the one
that matches your task before acting.**

## Ground rules

1. **Check auth first.** Before any MAGDA access, run `mgd auth status --json`.
   If it fails with exit code 2, no usable profile is configured — relay the
   error message, which says whether to run `mgd profile create <name>` (none
   set up) or `mgd profile use <name>` (one exists but isn't active). If
   `authenticated` is `false`, read-only public commands may still work, but
   mutations will fail — say so up front.
2. **Prefer curated commands** (`search`, `dataset`, `dist`, `file`, `aspect`)
   over `mgd api request`. Use the raw command only when no curated command
   covers the endpoint, and mention that you did.
3. **Always parse machine output.** Use `--json` (single document) or `--jsonl`
   (one JSON object per line) on every command whose output you consume.
   Never scrape human-mode output. Read and list commands emit their data as
   JSON; the aspect/record mutations (`aspect create`, `dataset aspect set`/
   `patch`/`delete`, `dataset`/`dist update`) print a compact `{…, "ok": true}` result in
   `--json` mode; and `aspect get` / `dataset aspect get` emit JSON already (the
   flag is optional there). Downloads write the file itself, so they take no
   `--json`.
4. **Respect exit codes.** `0` ok; `2` usage error (your command line is wrong);
   `3` auth error (key missing/invalid or no permission); `4` not found;
   `1` anything else. In `--json` mode a failing command prints
   `{"error": {"code", "message", "status", "hint"}}` on stderr.
5. **Confirm before mutating or publishing.** Never run `dataset create --publish`, `add-file`, `replace-file`, `update`, `aspect create/set/patch/delete`,
   or any `api request` with POST/PUT/PATCH/DELETE without the user's explicit
   go-ahead in this conversation. Uploading or attaching generated artifacts
   happens only when the user asked for it. For *how* to create and publish once
   the user has agreed, see `authoring.md`.
6. **Report identifiers.** Every user-facing summary must include the dataset
   IDs, distribution IDs, local file paths, and upload targets you touched.
7. **Versioning is automatic.** The CLI maintains the `version` aspect on
   high-level commands (`create`/`update`/`add-file`/`replace-file`/`remove`)
   and tags versions with registry event ids. `publish`/`unpublish` never bump
   versions. Never hand-edit the `version` aspect; raw `aspect set`/`patch`/
   `delete` never auto-bump.

**`set` replaces the whole aspect; `patch` merges.** To change one field (e.g.
add `keywords` to `dcat-dataset-strings`) use `patch` — it deep-merges your
partial object server-side and leaves the other fields intact. Using `set` for a
partial edit **silently drops every field you didn't include** (title,
description, keywords, license, dates), so default to `patch`; reach for `set`
only when you intend to overwrite the whole aspect. For advanced RFC 6902 ops
(remove/test/move), use `mgd api request PATCH …/aspects/<id> --body @patch.json`.

## Command index

Curated commands (prefer these over `api request`, ground rule 2):

| Command | Does |
| --- | --- |
| `auth status` | show the active profile + authenticated user |
| `profile create/update/remove` · `use/list` | manage site profiles & credentials |
| `search datasets <q>` · `search semantic <q>` | keyword / embedding search → `search.md` |
| `dataset get <id>` · `dataset distributions <id>` | read a dataset / list its distributions → `search.md` |
| `dataset create` · `dataset update <id>` | create (draft by default) / edit dataset metadata → `authoring.md` |
| `dataset add-file <id> [file]` | upload a file, or register a link with `--access-url`, as a distribution → `authoring.md` |
| `dataset publish/unpublish <id>` | set publishing state (cascades to distributions) → `authoring.md` |
| `dataset aspect get/set/patch/delete <recordId> <aspectId>` | read/write any aspect on any record (`set`=replace, `patch`=merge) |
| `dist get/update <id>` · `dist publish/unpublish <id>` | inspect / edit / flip a single distribution |
| `dist download <id>` · `dist replace-file <id> <file>` · `dist remove <id>` | download / replace / remove a distribution → `search.md`, `authoring.md` |
| `file upload/download` | direct storage transfer |
| `aspect list/get/create/delete <id>` | manage custom aspect *definitions* → `authoring.md` |
| `api request <method> <path>` | raw REST call (fallback only) |

Raw fallback (documented REST endpoints only):

```sh
mgd api request GET /v0/registry/records --query limit=3 --query aspect=dcat-dataset-strings
```

## Which reference file to read

Read the file(s) matching your task **before acting** — that's where the recipes
and their caveats are:

| If the task is… | Read |
| --- | --- |
| searching, finding, inspecting, or downloading datasets/distributions | `search.md` |
| creating, editing, or publishing a dataset; attaching files; editing or defining aspects | `authoring.md` (+ `dataset-elicitation.md` for the metadata conversation) |
| assigning or changing a dataset's **publisher / organisation** | `publisher.md` |
| making a **preview** render, or cataloguing **remote/link distributions** (ArcGIS/WMS/remote CSV/JSON); a format→preview question; a **403** on a preview | `preview.md` |

`dataset-elicitation.md` defines the metadata-consultant behaviour (infer before
asking, quick vs guided path, confirm-then-write) for any create/edit conversation.

## Error triage

- exit 3 + `unauthorized` → API key invalid/expired: ask the user to update the
  profile (`mgd profile update <name> --key-id … --key …`) or recreate it
  (`mgd profile create <name>`).
- exit 3 + `forbidden` → the key is valid but the account lacks permission for
  that operation. Common cause: the user assumed they could create/upload/publish
  but haven't been granted those rights. Report which operation was denied,
  explain it's a permissions grant (not a missing record or a bug), and advise
  them to ask their MAGDA system administrator to grant the relevant
  permission/role. Do not retry.
- exit 4 → record/object doesn't exist: re-check the ID (search again) before
  reporting data as missing.
- `semantic-search-unavailable` → use keyword search only (see `search.md`).
- Network errors mention the base URL — verify `mgd auth status` and the site
  URL before concluding the service is down.
