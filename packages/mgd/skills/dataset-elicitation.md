# Dataset metadata elicitation — consultant behavior

How an assistant should behave when using `mgd` to create or edit datasets.
Act like a professional data-catalog consultant: minimise questions, maximise
metadata quality, and never waste the user's time.

## The prime directive: context before questions

Before asking the user anything, gather what you can:

1. **The conversation.** Purpose, project, and audience are usually already
   mentioned. Re-read before asking.
2. **The data file itself.** Inspect it locally (headers, column names, row
   count, date columns, coordinate columns, file size/format). Draft a
   description from what you see.
3. **The catalog's conventions.** Search for similar datasets first:
   `mgd search datasets "<topic>" --limit 5 --jsonl`, then
   `mgd dataset get <id> --json` on one or two. Note the org's typical
   keywords, themes, license wording, and any custom aspects in use.
4. **The user's identity.** `mgd auth status --json` gives the user and org
   unit; ownership fields come from there automatically.

Only ask questions whose answers you genuinely cannot infer. Batch them —
prefer ONE round of at most 3–4 high-value questions. For everything else,
propose drafted values and ask for confirmation, which is faster to answer
than an open question.

## Two paths — offer the choice when unclear

**Quick path** (user signals urgency, or says "placeholder", "quick", "just
get it in"): create a draft record with the minimum — title and a short
description — attach the file, and stop:

```sh
mgd dataset create --title "Site sensor readings 2026" --desc "Raw CSV export; metadata to be enriched."
mgd dataset add-file <datasetId> ./readings.csv
```

Tell the user what was created (IDs) and offer to enrich the metadata later.
Do not interrogate them first.

**Guided path** (user is publishing something that matters): elicit purpose,
then fill the field tiers below, proposing inferred values.

## Purpose-driven field selection

Ask (or infer): _who will use this dataset, and for what?_ Then derive:

| Signal                     | Fields to raise                                    |
| -------------------------- | -------------------------------------------------- |
| Shared beyond the team     | access level / org unit, license                   |
| Recurring/periodic data    | update frequency (`accrualPeriodicity`), currency  |
| Derived/processed data     | provenance (source datasets, method)               |
| Geospatial columns         | spatial coverage                                   |
| Time-series columns        | temporal coverage                                  |
| Sensitive/regulated domain | information security classification, access notes  |
| Domain-specific attributes | a custom aspect (`mgd aspect create` + `--aspect`) |

## Field tiers

- **Minimum (always):** title, short description. `mgd dataset create` enforces
  title; never create a record with an empty description — one sentence is fine.
- **Recommended (raise before publishing):** keywords/themes, license, format
  (auto-detected from files), publisher, access level, update frequency.
- **Purpose-driven (from the table above):** raise only the relevant ones.

Never silently omit a field the inferred purpose calls for — suggest it and
let the user decide. Phrase suggestions concretely: "This looks like quarterly
data — set update frequency to quarterly?" beats "Do you want to add more
metadata?".

## Enrichment loop for existing datasets

When asked to improve an existing dataset (or after a quick-path creation):

1. `mgd dataset get <id> --json`
2. Produce a **gap report**: which minimum/recommended/purpose-driven fields
   are empty or defaulted, in one compact list.
3. Propose values for each gap (inferred where possible), get one confirmation,
   then apply with `mgd dataset update` / `mgd dataset aspect set`.

## Write discipline

- Datasets are created as **drafts**. `--publish` (or publishing-state changes)
  only after explicit user confirmation.
- Before any mutation, show a compact summary of exactly what will be written,
  marking which values were inferred vs provided.
- After mutations, report the record IDs and what changed.
- Replacing a file (`mgd dist replace-file`) preserves version history; tell
  the user the new version number.
