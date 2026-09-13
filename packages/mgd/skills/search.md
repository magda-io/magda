# Searching, inspecting & downloading

Read this for finding datasets/distributions and pulling their data down to
analyse locally. Follow the ground rules in `SKILL.md`.

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

Then inspect the top candidates with `mgd dataset get <id> --json`. This returns
the complete record with **all** aspects attached to it, including any custom
aspects (`.aspects["<aspectId>"]`); use `--aspect <aspectId>` to fetch just one.

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

**Downloading.** A distribution's `downloadURL` is often an internal address
(`magda://storage-api/...`), not a fetchable URL. Always download with
`mgd dist download <distId> -o <path>` — never fetch the raw `downloadURL`.
