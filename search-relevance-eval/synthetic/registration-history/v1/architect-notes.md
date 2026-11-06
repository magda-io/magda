# Architect handoff — frozen design, no corpus or outcomes

## Boundaries and provenance

A owns only the seven architecture files enumerated in the protocol. A read issue3903 through `gh issue view 3903`, the inherited protocol/query shape and metric implementation; A has not inspected ranking/scoring results for this experiment, generated searchable corpus metadata, called mgd, queried a catalogue or launched a generator/search. Source branch is `eval/synthetic-hybrid-benchmark-3903`, stacked on unmerged PR3902 commit15533246 from mainba181562. Requirement-object assembly is not metadata generation: explicit identifiers/exact titles are controlled requirements, while descriptions/titles for other records remain B's work.

Main must hash and validate all seven files BEFORE releasing B. The presence of this note is not authorization. Main maintains an external hash manifest; do not embed its own hash here. Architecture changes after handoff must be announced, audited and rehashed; never patch expected grades after seeing ranks.

## Machine-readable contract

* `intents.jsonl`:45 intent objects keyed `intent_id`.12 Asemantic,3 Bfunctional,24 exact,4 ambiguous,2 noanswer. `paraphrase_query_ids` gives each query membership. `split_group` is whole-intent or exact product cluster. Splits use `development`, `heldout`, `diagnostic`.
* `query-spec.jsonl`:75 objects keyed inherited `id`; human query text is `query`, not `text`. Also `suite`, `kind`, `category`, `split`, `intent_id`, `intent_group`, `intent`, `success_criteria`. Exact rows include `authoritative_target_ids`, `near_identifier_ids`, `critical`, `control`. Semantic synonyms use `synonym_absence_tokens` on third paraphrases, backed by intent-wide absent-token constraints.
* `generation-spec.json`: `record_plans` is a180-object explicit array, NOT an instruction to decide identities later. `suite` is A/B; `domain` is cocoa/confectionery/beverage for A, technical_products for B; **`family` is intent cohort s01 etc, NOT broad domain**. Count20/50/30 using `domain`. Stable `id` is a001..a100/b001..b080. `product`, `process`, `facts`, `hard_constraints` (also alias `constraints`), `distribution_requirements`, `canonical_claims`, `positive_anchor_intent_ids`, `hard_negative_for_intent_ids`, `metadata_requirements` are required. B adds `identifier_requirements` including authoritative string, explicit alias list, exact-title requirement where applicable, controlled identifier scope and forbidden scope fields.
* `intent_doc_grades` is complete45×180 numeric0..3. For each query–doc pair use `intent_doc_grades[query.intent_id][record.id]`. This is13,500 frozen pairs without duplicating equivalent-paraphrase labels. Missing key/unknown ID is fatal. A matrix grade is a design expectation, NOT independent validation. C must check actual evidence and query-intent equivalence.
* `qrel_derivation`, `seeds`, `suite_counts`, `suite_a_family_counts`, `metadata_variation`, `systems`, `embedding`, `runtime`, `indexing` freeze the remaining contracts. Main may adapt to inherited qrels/anchors schema in generated output, preserving identity/grade correspondence and hashes.

## Generator B

Generate exactly180 realistic metadata records PER seed,3seeds; same relevance and authoritative identity facts, independent natural realization. Read every record requirement, not just the prototype cohort. Do not search. Do not expose intent IDs, role labels, grades, target IDs, query strings or reject explanations in indexed metadata. Dataset structural IDs are identity only. No repeated category prefixes or uniform synthetic answer-key templates. Vary wording/length/completeness, publishers and distributions as frozen. Realistic distribution evidence must support formats/content; PDF-only contrasts must stay PDF-only. Keep title-only/distribution-only identifier scopes even in queryContext and embedding input; careless concatenation destroys the control.

Primary quality1 with hasQualitytrue is fixed per ID across seeds: deliberately neutral isolation, not full production realism. Separate fixed quality/spatial correctness probes do not alter primary qrels or become an outcome-selected relevance experiment. Optional metadata omissions cannot erase required claim evidence. State unsupported capabilities rather than inventing hidden metadata. Independent seed variation is substantive: report length/distribution counts and wording/template overlap, preserving exact claims.

## Auditor C

Fresh separate context; no rankings, score files, system labels or winner information. Review paraphrase equivalence independently, actual metadata support, absence/scope controls and ALL matrix rules. Cite every3 anchor's actual field path/phrase; explain every named hard negative. Cover2/1/0 too, not only high grades. Each semantic/functional query needs verified positive coverage; exact IDs must exist. Record proposed/audited grades and text evidence; unsupported is U, not0. Preserve raw observations, corrections and identity/seed coverage. Return clean/repair/U decision to main BEFORE relevance retrieval. Same model family is not independent human ground truth.

## Harness D and analyst E

Reuse inherited actual query export and metric code, adding evaluation-only adapters rather than a second search framework. Freeze runtime mappings/analyzers, pinned image/model/vector hashes, filters, neutral and stress semantics. Primary radial minScore0.5 depth10; secondary topk k1 correctness only. Preserve identical180 corpus and vectors for8 systems; `raw_boost1` removes ONLY the root vector boost. Log matched-boost contrasts and normalization proof. Fail/explicitly not-run controls instead of claiming pass from configured JSON alone.

E computes A primary equal heldout-family mean, exact objective controls and functional grades separately; noanswer and ambiguity stay diagnostic. Exact collision metric uses frozen near_identifier_ids only; all24 exact queries are critical. Any candidate target-rank worsening blocks A, not only top1 losses. Preserve query/seed/intent detail and top10 evidence.44 heldout positive queries×5 measured repeats give220 latency samples/system/seed, interleaved after one warmup. Suitely120/100 samples permit p95; no fabricated estimates for smaller subcohorts.

## Preflight facts and limitations

Expected counts:180 records,100A (20/50/30),80B,45 intents,75 queries,36 semantic variants,24 exact,9 functional,4 ambiguity,2 noanswer. A has4development/8heldout families. B functions1development/2heldout. All semantic/functional intents have>=1 intended3 and>=2 explicitly named0 negatives; actual answerability awaits C. All24 exact targets and collision lists are frozen before metadata. The embedding image is pinned from inherited setup, but underlying model repository revision was not independently verified; disclose this limitation and preserve vector hashes.

No outcomes exist in this architecture handoff. The only admissible final decisions are A/B/C controlled-engineering conclusions using the fixed gates. Incomplete engine work, absent independent evidence, mixed seeds or weak effects mean C/not-run, not a fabricated benchmark completion.
