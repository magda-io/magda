# Using the `mgd` CLI for MAGDA workflows

Instructions for assistant tools (and humans) driving a MAGDA data catalog
through the `mgd` command-line interface. Tool-agnostic: adapt the framing to
your assistant environment, keep the rules.

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
   Never scrape human-mode output.
4. **Respect exit codes.** `0` ok; `2` usage error (your command line is wrong);
   `3` auth error (key missing/invalid or no permission); `4` not found;
   `1` anything else. In `--json` mode a failing command prints
   `{"error": {"code", "message", "status", "hint"}}` on stderr.
5. **Confirm before mutating or publishing.** Never run `dataset create --publish`, `add-file`, `replace-file`, `update`, `aspect create/set/delete`,
   or any `api request` with POST/PUT/PATCH/DELETE without the user's explicit
   go-ahead in this conversation. Uploading or attaching generated artifacts
   happens only when the user asked for it.
6. **Report identifiers.** Every user-facing summary must include the dataset
   IDs, distribution IDs, local file paths, and upload targets you touched.

## Keyword vs semantic search — use both

`mgd search datasets <query>` — keyword/faceted search over the index.
Strengths: exact terms, org vocabulary, filters, pagination, fast. Weakness:
misses conceptual matches phrased differently from the metadata.

`mgd search semantic <query>` — embedding similarity over indexed content.
Strengths: natural-language and conceptual queries ("rainfall trends near
brisbane"), matching document content rather than titles. Weakness: not
available on every site — it fails with code `semantic-search-unavailable`;
fall back to keyword-only silently.

Recipe — combined search:

```sh
mgd search datasets "water quality" --limit 20 --jsonl > kw.jsonl
mgd search semantic "water quality" --limit 20 --jsonl > sem.jsonl || true
# merge: keep keyword rank first, append semantic-only recordIds
jq -r '.identifier' kw.jsonl > ids.txt
jq -r '.recordId' sem.jsonl | grep -v -x -F -f ids.txt >> ids.txt
```

Then inspect the top candidates with `mgd dataset get <id> --json`.

## Common recipes

Search → inspect → download → analyse locally:

```sh
mgd search datasets "air quality" --limit 10 --jsonl | jq -r '.identifier'
mgd dataset get ds-abc --json | jq '.aspects["dcat-dataset-strings"]'
mgd dataset distributions ds-abc --jsonl | jq -r '[.id, .aspects["dcat-distribution-strings"].format] | @tsv'
mgd dist download dist-xyz -o ./data/raw.csv
# analyse ./data/raw.csv locally with your usual tools
```

Download many distributions:

```sh
mgd dataset distributions ds-abc --jsonl \
  | jq -r '.id' \
  | xargs -I{} mgd dist download {} -o ./data/{}.bin
```

Large files: downloads resume with `--resume`; uploads switch to multipart
automatically at 16 MB — no flags needed.

Upload an artifact the user asked to publish (see dataset-elicitation.md for
the metadata conversation first):

```sh
mgd dataset add-file ds-abc ./analysis/summary.parquet --title "2026 summary" --json
```

Custom / domain metadata:

```sh
mgd aspect list --jsonl                     # what aspect types exist here?
mgd aspect create my-domain --name "My Domain" --schema @schema.json
mgd dataset aspect set ds-abc my-domain @values.json
```

Raw fallback (documented REST endpoints only):

```sh
mgd api request GET /v0/registry/records --query limit=3 --query aspect=dcat-dataset-strings
```

## Error triage

- exit 3 + `unauthorized` → API key invalid/expired: ask the user to update the
  profile (`mgd profile update <name> --key-id … --key …`) or recreate it
  (`mgd profile create <name>`).
- exit 3 + `forbidden` → the key works but lacks permission: report which
  operation was denied; do not retry.
- exit 4 → record/object doesn't exist: re-check the ID (search again) before
  reporting data as missing.
- `semantic-search-unavailable` → use keyword search only.
- Network errors mention the base URL — verify `mgd auth status` and the site
  URL before concluding the service is down.
