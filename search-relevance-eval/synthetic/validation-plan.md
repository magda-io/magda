# Independent ground-truth validation — C / issue #3903

## Authority, information boundary and current status

C read [issue #3903](https://github.com/magda-io/magda/issues/3903) using `gh issue view 3903`. This is independent ground-truth review, not generation, retrieval, judging of ranked results, or production-utility assessment. C has not generated dataset metadata, accessed a catalogue, run embeddings/search, or inspected system rankings. Only C-owned validation files may be changed by C; A's seven architecture files are not edited by C.

**Initial pre-freeze disposition: STOP for the concrete defects below.** This is a review of the initial specification, not a claim about generated text (none existed). Main confirmed B had not started and relayed findings to A. Preserve this initial assessment when A repairs the specification; record a separate disposition of the revised bytes. The completion gate is operational clarity for a controlled engineering comparison, not a demand for ideal production queries.

## Initial pre-freeze findings

### C01 — Disambiguated queries do not express hard product restrictions

The initial [query specification](<query-spec.jsonl>) inherits the same grades for every paraphrase, but some paraphrases omit restrictions which turn a defensible interpretation into grade 0:

| Query ID | Actual initial query wording / implicit restriction | Concrete consequence |
|---|---|---|
| s02p3 | `orchard productivity figures in comma separated files` / cacao crop | Other orchard crops satisfy the text; cacao is not expressed. |
| s06p1 | `solid confectionery texture and fracture force` / solid chocolate | Non-chocolate solid confectionery is defensible. |
| s10p1 | `chilled dairy beverage shelf life in CSV tables` / chocolate | Plain/flavoured non-chocolate dairy is not excluded by the query. |
| s10p3 | `refrigerated cacao refreshment longevity in comma separated files` / dairy | Planned a077 is a chocolate oat beverage with refrigerated shelf-life evidence, yet is frozen 0. |
| s11p1 | `chocolate drink formulation and liquid viscosity` / dairy | Planned a087 chocolate oat formulation satisfies the requested concepts, yet is frozen 0. |
| s11p3 | `balancing cacao and sweetener in a pourable refreshment` / dairy | Same a087 false-zero interpretation. |
| s12p3 | `microbial souring of a liquid cacao refreshment` / dairy and deliberate starter-culture fermentation | Planned a097 oat-beverage fermentation is defensible; spontaneous spoilage is also not explicitly excluded. |

Evidence: initial [intents](<intents.jsonl>) s02/s06/s10/s11/s12 require the narrower products; initial [record plans and grade matrix](<generation-spec.json>) a077/a087/a097 are oat products and grade 0 for their neighboring dairy intent. No geographical restriction appears in these initial intents; none may be invented later from a publisher/site name. Fix query disambiguation before generation, or explicitly approve a changed criterion/matrix. Do not call these interchangeable paraphrases merely because intent IDs match.

### C02 — Unmentioned empirical-only restriction creates false zeros

The initial [rubric](<relevance-rubric.md>) makes simulation-only metadata grade 0 for every semantic/functional intent. For example, s05p2 `packaging for solid milk chocolate bars` does not require observed measurements, but a029 has the correct product/process and all three packaging facts, with simulation-only basis. Likewise a039/a049/a059/a069/a079/a089/a099 are designed simulation contrasts. A simulated packaging or formulation dataset is defensibly relevant to several initial broad queries; it is not inherently irrelevant.

Resolution: make the controlled empirical-evidence requirement explicit in the affected queries (and preserve it consistently across paraphrases), or pre-register a different relevance treatment. Describing the restriction only in hidden intent metadata does not disambiguate the submitted search query.

### C03 — Intended grade differences depend on suppressing facts already entailed by product/process

Initial [record plans](<generation-spec.json>) contain contradictions between evidence requirements and prohibited facts:

* a023/a025: product `solid_milk_chocolate`, process `bar_packaging`, but `do_not_assert_facts` includes `solid_bars`.
* a033/a035: product `solid_chocolate`, process `texture_testing`, but omit/prohibit `solid_texture`.
* a073/a075 and a093/a095: product `chocolate_dairy_beverage`, but omit/prohibit `liquid_dairy`.
* a077/a097: product `chocolate_oat_beverage`, yet positively require `liquid_dairy`. The plan must not force B to present a dairy-free oat contrast as dairy.
* b003/b009 and several later f01 partials: product `running_shoe` already supports `running_use`; b004/b010 have process `wet_pavement_testing` while their intended grade 1 includes only `wet_grip`, although that process also entails a paved surface. The intended grade cannot be recovered honestly by counting only generator fact tags.

Resolution supported by main: use independently measurable observation variables rather than ontological product attributes, e.g. a measured lactose fraction, observed form-code column, measured surface condition or use-specific trial variable. A product may be known while a particular measurement column is unavailable; these are different claims. Define what evidence establishes each variable. Recompute the entire intended matrix before freezing if rules change. C will count actual semantic evidence, including implications, not pretend that a missing tag means a fact is absent.

### C04 — A paraphrase requests evidence not required of its anchors

f03p3 is initially `traceable thermometry for a freezer and chiller`. The registered f03 facts are calibration error, range -20 to +5 C and coldroom use. Calibration error alone does not establish traceability to a reference standard. B is not required to provide traceability evidence. Either make that extra requested property part of the frozen generation requirements (with actual searchable evidence) or align the paraphrase before generation. Similarly, empirical/range requirements must be expressed consistently rather than silently treating f03p1's broad `cold rooms` as a request for a particular range.

### Initial checks without detected flaws

A direct offline structural recomputation found 45 intents, 75 query rows and 180 record plans; complete intent–ID maps; no discrepancy between the initial formal grade algorithm and its 45×180 planned matrix; no duplicate authoritative identifier strings; and all 24 exact queries matching a registered target string, alias or exact title. These are **specification consistency checks, not independent corpus-label validation**.

The initial exact controls explicitly distinguish b001 RUN-X120 and declared case/hyphen aliases from b005 sole, b011 lace, nearby models, I/1, O/0 and version identities. No pre-freeze exact identity flaw was found. Exact-title controls are acceptable controlled navigation tests, not claims that their bare phrases uniquely identify real-world catalogue entries. b027/b028 distribution-only and b029/b030 title-only placement must still be checked in actual fields. `drink`, `dessert`, `plant`, `storage` are correctly separated as four exploratory diagnostics, not a hidden single-family target.

## Revised-spec review gate

Before main creates the immutable specification freeze and invokes B, C will re-read changed query, intent, generation and rubric bytes and return either:

1. **C pre-freeze green**: C01–C04 concretely resolved; query→intent mapping operationally clear; measured-variable grade distinctions realizable; no newly discovered concrete flaw; or
2. A finite list of unresolved IDs/rules with evidence, not a request for stylistic optimization.

This green does not certify generated labels. Main's immutable freeze must bind all seven architecture files, source commit, seeds, stable IDs and full intended matrix. No dataset prose is generated as part of this pre-freeze review.

## Final revised-spec disposition — C pre-freeze PASS

After main announced A's seven-file handoff ready, C re-read all 75 queries, 45 intent definitions, revised rubric, architect notes and decision gates, and reviewed relevant generation requirements. **C01–C04 are resolved for the controlled engineering purpose. No additional concrete pre-freeze blocker was identified.** This is specification approval only, not a corpus/qrels validation pass or generator launch authorization; main still freezes and commits the exact seven files before releasing B.

* C01/C02: revised phrasings express empirical/observed/measured evidence and the intended cacao/chocolate/dairy product distinctions. No geography is silently required.
* C03: independently documented seal failure, particle size, moisture, residue mass, microbial count, residual sugar and wet-friction/surface/water-film variables replace ontological attributes. A partial record can retain its known product while omitting a separate measurement column, without contradiction.
* C04: all three f03 phrasings express -20 to +5 C. Final f03p3 is `observed temperature probe calibration for freezers and chillers from minus twenty to five Celsius`; unsupported traceability has been removed. This was checked against the final query bytes, not assumed from A's report.
* Independent offline recomputation again found 45 intents, 75 queries, 180 plans and A20/50/30; complete grade maps match the independently implemented formal algorithm; query criteria match intent criteria; no asserted/prohibited fact overlap; exact queries match registered targets, aliases or exact titles. Exact identity/component/version distinctions and separate ambiguity diagnostics remain clear. This structural result does not replace actual-text auditing.

Final reviewed hashes (cross-check, not main's immutable freeze):

| Architecture file | SHA-256 |
|---|---|
| [protocol](<protocol.md>) | `e7b2baab7a0b2304ce29771901aba701e45901b6bbda026f8d43e5ba5349f8fb` |
| [intents](<intents.jsonl>) | `61b5469fbbfdaa9cd1729bd14a412f12166d94be044ff8ad020691aa5c1dbefc` |
| [queries](<query-spec.jsonl>) | `083366c868eea5d8f71c133cc5a022f7aba86f03fd2596c931feaf927d78377d` |
| [generation specification](<generation-spec.json>) | `7518298bab9b54beb874ef39d52535142d1be10a3a72d8b84930cb273af6073d` |
| [rubric](<relevance-rubric.md>) | `a01685610ad2b6a01b24fd7d4c7c70ffabb14f8315e1ff283c9c2398a52d6a15` |
| [decision gates](<decision-gates.json>) | `c396debc6ad77bbb11ac403f7c195a4f13097aae30831395079e6659e87147d3` |
| [architect notes](<architect-notes.md>) | `8812732e089e643503c08bd36e9aa20d9e5b76f2e068a37b03da7d499b3bee67` |

No metadata existed during this review. All three seeded corpora still require independent actual-text claim preservation, fresh semantic review, complete matrix coverage and answerability before any relevance retrieval.

## Post-generation independent actual-text audit

### Inputs and denied inputs

Allowed: immutable spec freeze, exact frozen queries/intents/rubric, all three full corpora, proposed qrels, generation requirements, and actual searchable-field/embedding-input definitions. Generator code is not the authority for factual meaning. Denied: all baseline/candidate/control ranks, scores, result pools, winning-system summaries, model tuning and catalogue acquisition. C neither runs an engine nor needs rankings to validate labels.

Audit each seed 39031/39032/39033 independently. Do not infer seed 2/3 correctness from seed 1 or from shared templates/fact tags.

### Independent derivation and semantic review

1. Build an allowlisted view of actual indexed fields: title, description, keywords, publisher text where indexed, queryContext, relevant spatial/temporal text and nested distribution titles/descriptions/formats. Plan tags, internal labels, family names and stable-ID prefixes are not evidence.
2. Extract independently interpreted product/process, observed variables, actual formats and empirical basis **from that view**. Record field paths and verbatim text. Recognize negation, hypothetical descriptions, measurement values versus mentions, and statements excluding a variable. Do not import B's grade function or trust its `facts`/`canonical_claims`/labels as observed truth.
3. Derive the full intent–record grade from C's independently supported observations and the frozen rubric; compare with proposed grades only after derivation. For 0, cite the decisive product/process/constraint mismatch or lack of the requested evidence. Missing evidence and an explicit contradiction remain distinguishable.
4. Manually review all query→intent equivalences in fresh context after any amendments; reject query-specific requests unsupported by an inherited intent grade. Cover 45×180 intent pairs per seed and explicitly expand the independently reviewed equivalences to all 75×180 query pairs. A batched audit can supply independent evidence observations, but C/main must coordinate fresh-context auditors; generator labels and rankings stay hidden from those auditors.
5. For **every grade-3 anchor**, include quotes establishing product, process, all three independent variables, empirical basis and any required format. Exact positives need identity evidence, not semantic preference. For **every named hard negative**, include quotes establishing why it fails. Audit all other grades and possible accidental positives too; anchor-only checking is insufficient.
6. A quote must be a literal substring at its reported field path in the hashed corpus. Mentioning a field name or repeating the requirement is not proof that measurements exist. A machine substring test is necessary but not sufficient; fresh manual semantic review establishes entailment. Every unsupported positive or unresolved contradiction becomes an issue / U, never a silently accepted grade or an automatic 0.

### Corpus validity, identity and variation

* Exactly 180 unique stable IDs per seed, A100/B80 and A20/50/30 allocation; same complete ID set and intended identity across seeds.
* No duplicated full records, accidental content duplicates, mutually inconsistent fields, impossible product/fact combinations, or grade/intent/answer-key leakage. Inspect repeated title/prose patterns and distribution variation; merely changing numbers or order is not independent realization.
* For each authoritative target verify its exact identifier/declared aliases and the intended product versus component/version distinction in actual text. Scan the complete corpus for unplanned equivalences, target aliases on a wrong product, and accidental duplicate authoritative identities.
* V2 explicit pre-generation amendment: b027/b028 identifiers remain only in nested distribution text, absent from root queryContext. For b029/b030, title-only means primary metadata title only (not description, keywords, publisher or distributions); the mandatory exact production-derived root queryContext and embedding input retain the title identifier unredacted. Validate root `Title: …\nDescription: …\n` and child `Title: …\nFormat: …\nDescription: …\n` projections exactly; no independent insertion or custom redaction. C independently read production Scala lines 755–775 and approved the narrow amendment in [prefreeze-v2.json](<auditoutputs/prefreeze-v2.json>), after comparing the complete archived-v1 generation dictionary and unchanged queries/intents/gates. The amendment changes only b029/b030 identifier-scope requirements and matching protocol documentation, not labels or target queries.
* Required CSV must have corresponding nested distribution evidence for the relevant content, not an unrelated CSV elsewhere. No unadvertised format or inferred downloadable content.
* Designated absent synonym tokens must be absent case-insensitively as whole tokens in every searchable field of every grade>=2 positive, across all seeds.
* Inspect both no-answer conjunctions across the entire searchable corpus. Ambiguity maps remain exploratory; do not enforce one family above another or erase legitimate meanings.
* Record per-ID cross-seed field/prose/length/publisher/distribution comparisons and manual variation judgments. Claim preservation and sufficient independent realization are separate checks. Report weakness; never select a favorable seed.

### Answerability and remediation

Every scored semantic/functional positive query requires independently verified grade>=2 (prefer grade3); the loss of every grade3 is an explicit pre-run amendment, not a silent weakened gate. Every exact query requires its authoritative target present with identity evidence. Apply these checks separately to all three seeds.

Fixture repair is preferred over changing queries/criteria after generation. Report unsupported expected labels with affected IDs/pairs, actual evidence, frozen expected claim and required correction. B/main repair metadata against unchanged frozen truth; C re-audits affected records and full rule coverage. Any specification/qrel change needs a pre-run amendment log with rationale, old/new hashes and main/A approval before retrieval. No repairs after ranking exposure. Preserve unresolved pairs as U and do not issue a passed manifest.

## Actual realization prechecks and independent-review handoff

The first realized corpus was **rejected before relevance retrieval** for mechanical repeated-sentence padding, independently of B's simultaneous self-review. The [rejection record](<auditoutputs/first-realization-rejection.json>) binds all three original corpus hashes and literal evidence: a001/a073 in seed 39031 repeat `The edition preserves the original row ordering.` three times; a001/a002 in seed 39032 repeat `Rows retain local observation keys for reuse.` three times. Full scanning found repeated description sentences in 82/180, 90/180 and 96/180 records respectively. Original fields and counts are retained in the [first-review projection](<auditoutputs/corpus-first-review.json>). No labels were certified or changed.

B/main repaired fixture prose and fractional integer-count examples under unchanged frozen specification, queries, IDs and grades, preserving first-realization bytes. C's [corrected-realization preflight](<auditoutputs/corrected-realization-preflight.json>) independently matched corrected corpus hashes, found zero intra-record repeated sentences and zero raw identifier-scope/production-context/format/neutral-quality/obvious-leak failures across 540 records. Observable variation passed: 173/180 stable IDs have at least ten words of description-length variation, and 139/180 vary distribution count. C read representative corrected semantic/functional anchors across all three seeds. This is permission to proceed with expensive independent evidence review, **not a corpus-label pass**; canned archival phrasing remains an external-validity limitation.

C's packet builder in [validate.py](<validate.py>) projects actual indexed text into 18 [fresh-review packets](<auditoutputs/packets-v2-manifest.json>), each ten stable IDs across all three seeds (30 record reviews). Every independent primary searchable field remains; exact production-derived queryContext duplicates are omitted only after raw equality checks. Packets contain unassociated global concept vocabulary, frozen intent definitions and declared contrast intent IDs, but no per-record canonical fact claims, expected grades or generator lexicon. C produced no semantic observations mechanically. Main orchestrates fresh independent contexts; C aggregates their actual persisted observations only after completion.

The [75 query-equivalence reviews](<auditoutputs/query-reviews-v2.json>) record C's real independent pre-freeze and follow-up text assessment with [authored rationales](<auditoutputs/query-equivalence-rationales.json>), actual query text and the frozen query hash. They certify query interpretation, not document support. The subsequent scope amendment leaves these query/intent bytes unchanged.

## Validation artifacts and manifest contract

C later owns `validate.py`, `test_validate.py`, audit outputs and the validation manifest; no generator or retrieval code. Tests must falsify the gate with removed/negated evidence, contradicting values, mislabeled empirical/simulation basis, wrong IDs/aliases/scope, wrong or absent format, duplicated IDs/text, leaked labels, unsupported positives, missing query coverage and mutated seed bytes. A generator-supplied fact tag must never rescue invalid searchable text.

The independent evidence artifact must include per-seed corpus hash, per-intent/record independently interpreted observations, proposed and derived grades, evidence field paths/quotes, all hard-negative explanations, all grade3 anchors, paraphrase-equivalence verdicts, completeness counts, coverage and manual semantic/variation review provenance. Bind any human/fresh-context review to exact artifact bytes. No passing manifest before the semantic review is complete.

A passed manifest uses schema version 1 and the following required contract (paths relative to the manifest's parent, the synthetic root):

```json
{
  "schema_version": 1,
  "status": "passed",
  "independent_validation": true,
  "pre_retrieval": true,
  "spec_freeze_sha256": "<SHA256 of immutable spec-freeze.json bytes>",
  "query_spec_sha256": "<SHA256>",
  "qrels_sha256": "<SHA256>",
  "qrels_path": "qrels.jsonl",
  "corpora": [
    {
      "seed": 39031,
      "path": ".local/corpora/seed-39031.jsonl",
      "sha256": "<SHA256>",
      "dataset_count": 180,
      "record_ids_sha256": "<SHA256 of json.dumps(sorted(ids), separators=(',', ':')).encode()>",
      "answerability_passed": true
    }
  ],
  "validation_evidence_path": "<relative evidence artifact path>",
  "validation_evidence_sha256": "<SHA256 of referenced artifact bytes>",
  "unsupported_grade3_count": 0,
  "missing_positive_queries": [],
  "exact_targets_missing": []
}
```

The corpus list must contain exactly all three registered seeds, not just the example row. Resolve paths relative to `validation.parent`; reject path escapes or missing artifacts. A status string alone is not proof: the consumer must rehash the freeze, queries, qrels, each corpus and evidence, and validate complete ID/count/seed coverage. `independent_validation` describes actual separated review, not a flag B is allowed to self-certify.

## Final C disposition — confirmatory validation incomplete; diagnostic-only proof frozen

**No strict passed validation manifest was produced.** Actual independent review found an unresolved intended hard-negative boundary in a057: grounds-maintenance tools associated with a confectionery factory have all three sanitation measurements, but the frozen factory-hygiene queries do not explicitly exclude this defensible interpretation. Moving the study to an independent nursery or former factory site would change its frozen factory-sanitation claim to obtain the desired zero; C rejected that repair. The exploratory `plant` diagnostic also cannot silently choose between the frozen factory-sanitation grade 3 and factory-landscaping grade 2 interpretations. The [scope decision](<auditoutputs/unresolved-a057-scope-v4.json>) and [explicit mask](<auditoutputs/diagnostic-uncertainty-mask-v1.jsonl>) preserve these uncertainties: six intent–record–seed units, expanding to **12 query–record–seed U labels**. No unknown was coerced to zero or created automatically from an extraction mismatch.

Main explicitly approved a separate supplementary nonpromotional replay under the [diagnostic contract](<diagnostic-contract.json>). Its [C diagnostic document](<diagnostic-validation.json>) is `incomplete_diagnostic_only`, with `full_validation_passed: false`, `promotion_allowed: false` and forced recommendation **C**. It is not a successful confirmatory experiment or production-relevance claim. The default strict validator remains fail-closed.

Independent audit completion:

* All **540 actual record realizations** and **75 query equivalences** are preserved, including original U flags, original false variation judgments, subsequent original-author adjudications and every source artifact hash.
* All **40,488 known query–record–seed pairs** independently derive exactly the unchanged frozen expected grades. All 12 other pairs remain U in the [40,500-row diagnostic qrels](<diagnostic-qrels.jsonl>); the original proposed qrels remain unchanged.
* Every scored semantic/functional query has independently evidenced grade-3 anchors in every seed; all 24 exact controls have their authoritative targets. Known grade-3 anchors and all named hard negatives have actual-field quotation evidence in the [independent evidence wrapper](<auditoutputs/diagnostic-validation-evidence.json>), which binds the [complete final manual evidence](<auditoutputs/final-manual-evidence-v4.json>).
* V2→V3 repair scope was independently checked as 37 records/92 leaf fields with 503 entire JSONL rows, including line endings, byte-identical. V3→V4 changed only two misleading simulation root titles and derived contexts, preserving 538 entire rows. New observations replaced only independently re-reviewed records; unchanged-record reuse required full raw-row equality, not just matching quoted snippets.
* All nine original-author full-scope variation adjudications explicitly supersede historical objections under the actual frozen measurement/identity constraints. Illustrative example values and fictional sites are not hidden fixed numerical criteria. Original false judgments remain available; none was silently flipped.
* The pure `validate_diagnostic(root, evidence_path, uncertainty_mask_path, validated_qrels_path, derived_audit=None)` API rechecks source/hash/current-record closure, literal evidence, known grade derivation, coverage, exact targets and uncertainty consistency. It reproduced the archived C document exactly. **32 offline tests pass**, including preservation of record-level uncertainty, unchanged strict rejection, decisive simulation-only zero, positive content-association requirements and explicit full-scope variation supersession.

The validator source was locked when the diagnostic evidence/document were emitted; its SHA-256 is bound by the evidence wrapper. No target-query embeddings, retrieval, rankings or system outcomes were executed or inspected by C. Fresh model contexts are correlated, not independent human judgments. Any downstream diagnostic execution needs main's separately hash-bound policy and explicit approval before the first target-query embedding; C's incomplete document alone is not execution permission.
