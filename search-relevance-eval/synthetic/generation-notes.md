# Dataset generation — issue 3903

## Interface and boundaries

```sh
python3 search-relevance-eval/synthetic/generate.py \
  --output-dir search-relevance-eval/synthetic/.local/corpora-v4
python3 search-relevance-eval/synthetic/generate.py \
  --output-dir search-relevance-eval/synthetic/.local/corpora-v4 --verify-existing
python3 -m unittest discover -s search-relevance-eval -p test_generate.py -v
```

The first command creates three 180-row corpora, the exhaustive 13,500-row
expected qrels, an eight-record sample, and a generation manifest. Existing
files are never overwritten. The second command explicitly accepts only
byte-identical files; a changed existing file is an error. The manifest retains
its first creation timestamp when verifying an existing generation. Output
paths are absolute in the manifest; its timestamp and paths are provenance,
not corpus randomness. Corpus and qrel bytes regenerate deterministically.

Python callers may use `generate(seed, root=ROOT)`, `expected_qrels(root=ROOT)`
and `run(output_dir, root=ROOT, verify_existing=False, manifest_path=None,
sample_path=None)`. The import and every generation/qrel entry point call
`freeze.verify(root)`; unregistered seeds and changed specifications fail
closed. No external service, catalogue, downloaded content, embedding model or
retrieval outcome is used.

## Shape and evidence

Records are indexed Magda DataSet objects, not Registry aspect wrappers:
`identifier`, `title`, `description`, `keywords`, a publisher object, neutral
`quality=1`, `hasQuality=true`, published state, tenant zero, and nested
Distribution objects. Distribution metadata supplies format, media type,
synthetic.invalid download URL and a concrete column dictionary with units,
categorical values or numeric examples. Every required format remains
available. PDF-only records do not advertise a machine-readable alternative.

The dataset and distribution context formatters reproduce the production
indexer's Title/Description and Title/Format/Description projections,
including the final newline. They do not concatenate keywords, publishers,
labels or child text into parent contexts. Distribution-only identity tokens
occur in child titles/descriptions and their derived child contexts only.
Title-only identity tokens occur in primary dataset titles and the production
projection of those titles; the active preregistration amendment documents
this necessary derived-field exception. Exact required titles are invariant
across seeds; no aliases are invented.

Column dictionaries describe measured variables rather than asserting that a
product concept implies a measurement. A partial record does not gain an
omitted measurement because it remains, for example, a liquid milk drink or a
running shoe. Short dataset descriptions leave their full variable dictionary
in the searchable child descriptions; medium and long descriptions also
repeat it at the parent. This is optional metadata completeness variation, not
a change to evidence. Simulation-only records explicitly describe computer
output and absence of physical observations. Observational records distinguish
physical measurements from observed administrative entries, with generic
synthetic provenance kept separate.

All institutions, sites and examples are fictional. No personal information,
external record text or operational location data is used. Generic contact
addresses and download links use the reserved `.invalid` domain. Source
metadata states local synthetic authorship without exposing suite, intent,
grade, canonical claims or design-role labels.

## Deterministic variation

Independent SHA-256-derived PRNG streams depend on seed and stable record ID.
They vary grammar, paragraph ordering, measured numeric examples, reporting
length, optional fields, publisher, institutional completeness, file count and
already-supported file slices. Forty-eight balanced title constructions use
product/process-specific wording and fictional sites; exact-title controls
bypass these constructions. Sites are permuted without replacement within a
seed, making same-plan positive studies separate investigations rather than
duplicate descriptions of one experiment.

Three description-length bands are assigned independently of design labels.
Editorial paragraphs concern record layout, missing-cell interpretation,
local keys and reuse; they do not add target measurements. Publisher selection
is orthogonal to relevance, with sixteen possible fictional institutions.
Optional issued date, language, contact point, spatial text and child licence
are retained probabilistically. Spatial text has no geometry or ranking
preference. Required formats and all canonical relevance facts remain fixed.

The manifest quantifies title uniqueness and word counts, description length
bands, publisher counts, distribution counts, pairwise token Jaccard overlap,
pairwise word-count differences and cross-seed file-count changes. These are
mechanical diagnostics of realization variation, not evidence that natural
language is representative of a real catalogue. Frozen literal token bans are
checked over all string values, including derived contexts and optional
fields.

## Labels and verification status

Expected qrels are copied **only** from
`intent_doc_grades[query.intent_id][record.id]`. No grade is inferred from
realized prose, category, lexical overlap or search results. Missing matrix
keys are errors. Structural IDs remain `a001`–`a100` and `b001`–`b080`, shared
across seeds; the manifest ID hash is SHA-256 of compact JSON for sorted IDs.

Offline generator tests check population, contexts, formats, omissions,
literal bans, exact identities, byte determinism, immutable output and
fail-closed freeze behavior. They are generator self-checks only. **Independent
C metadata-evidence and label validation is required before retrieval. No
independent-label PASS is claimed here.** No quality stress fixtures are
produced; those remain separate correctness work.

## Realized output and pre-retrieval correction

The first realization was created at `2026-11-06T00:02:44.726307Z`, after the
active v2 specification freeze (`2026-11-06T00:02:16.299953Z`). Self-review and
C both identified duplicated padding sentences within some descriptions.
Main approved a generated-text-only correction before final independent audit:
neutral notes are now selected without replacement, and count examples use
integers. The original three corpora remain untouched in `.local/corpora/`;
the corrected three corpora are in `.local/corpora-v2/`. The original manifest
and sample are preserved beside the first corpora. No target text, identity,
canonical fact, expected grade, seed or qrel byte changed.

[The realization amendment](<search-relevance-eval/synthetic/generation-amendment-v1.json>)
binds the before/after hashes, code hashes and unchanged specification/qrels.
[The final generation manifest](<search-relevance-eval/synthetic/results/generation-manifest.json>)
binds the corrected corpora and includes the superseded realization history.
That first correction's output verification and twelve offline generator tests
passed. The later v3 scope correction described below has thirteen tests.

Across the corrected three seeds:

- Each has 180 unique titles, with 4–11 words per title and sixteen publishers.
- Description lengths range from 52 to 218 words; every registered length band
  contains at least 51 records per seed (minimum required: 36).
- No repeated description sentences remain in any of the 540 records.
- 173/180 IDs change description length by at least ten words across seeds.
- 139/180 IDs change distribution count across seeds.
- Pairwise mean description-token Jaccard overlap in final v3 is 0.3447–0.3563.
- Four preregistered exact titles remain invariant; the other 176 titles vary
  between each pair of seeds.

## Narrow independent-review fixture correction: realization v3

Main approved two hash-bound C requests and a separate approval artifact before
embeddings or scores. The base PRNG realization remains unchanged: a deterministic
post-generation patch checks the exact v2 corpus and record hashes, then changes
only 48 approved repair entries affecting 37 seed/record pairs:

- Twenty-nine misleading child titles become `Simulation output table` only
  where the corresponding release explicitly has simulation-only basis.
- The a005 opening sentences identify warehouse bags of harvested cacao material,
  not bag-inspected living trees; site names and operational columns remain.
- The specifically listed administrative records lose unsupported physical-sample
  provenance, replaced with observed administrative/non-model provenance.
- The a057 description locates the existing ornamental-plant tools outside
  confectionery production areas; all cleaning/swab/residue columns remain.
- The a076 opening sentences attach chocolate dairy beverage positively to
  transported cartons, with shelf-life trials separately negated.

Only those source fields and their exact production-derived contexts change:
92 leaf fields in total. All other **503 complete JSONL rows are byte-identical**
to actual preserved v2 rows, including terminal newlines. No title adjective or
category-leading diagnostic case outside the approved requests is changed.
No hidden grade criterion is added, and a057's supported relevance remains for
C to judge independently; the generator does not force its grade from prose.

[The second realization amendment](<search-relevance-eval/synthetic/generation-amendment-v2.json>)
binds both C request hashes and approval hash, old/new generator and corpus
hashes, all field-level before/after values, and all 540 row identity proofs.
The previous versions remain untouched. A short-lived v3 draft that dropped
site-sector suffixes was detected in the generator's own actual-text check,
preserved locally, and corrected before final root-manifest promotion; its
hashes and the reason are included in that amendment as well.

The v3 corpora remain preserved in `.local/corpora-v3/`. The v3 patch layer
fails closed if any approved patch artifact changes, verifies all pre-patch
hash conditions and refuses unknown existing output. Thirteen offline tests,
byte-identical final CLI verification, frozen-spec verification, all original
literal-ban/format checks and registered variation thresholds pass. There is
no additional padding or off-scope metadata repair to achieve those thresholds.

## Two simulation-title corrections: realization v4

C's systematic check of all 24 simulation-only root titles identified exactly
two explicit observation/field-note claims inconsistent with the stated
model-only basis. Main approved the exact replacement titles for seed 39032,
a039 and a079, in a hash-bound request and approval. A second post-generation
layer changes only those titles and their production root contexts. All other
**538 complete v3 rows remain byte-identical**, including terminal newlines.
The cumulative v2-to-v4 affected record set remains 37; no other neutral title,
trial wording, product/process evidence, child metadata or label changes.

The final corpora are in `.local/corpora-v4/`, and the default CLI now reproduces
v4. [The third realization amendment](<search-relevance-eval/synthetic/generation-amendment-v3.json>)
preserves old/new corpus and code hashes, all four changed leaf values and the
538-row equality proof. Root sample bytes remain unchanged because the
sample uses seed 39031. Fourteen offline tests, byte-identical CLI verification,
frozen-spec verification and all original variation thresholds pass.

These are generator diagnostics only. Independent actual-evidence validation,
including review of the 37 v3 changes and the two final title changes, remains
C's responsibility; these notes do not grant a retrieval gate.
