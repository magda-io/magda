# Frozen query–document relevance rubric

## Authority and scope

These labels are **synthetic design truth**, not human judgments. Structured planned claims define intended evidence; only independent inspection of realized searchable metadata establishes supported qrels. C receives frozen intents/query text/plans/rubric and all generated text, never system names, rankings, scores or outcome summaries. C must independently assess whether each paraphrase actually expresses the registered need; it must not assume equivalence because three rows share an intent ID.

All180 records are considered for every query, including the other suite. Exact objective identities use authoritative dataset IDs, independently of a semantic assessor. `generation-spec.intent_doc_grades[intent_id][dataset_id]` freezes ALL45×180 intent–doc grades;75×180 query–doc grades inherit these maps. Every key must exist. Domain/family allocation is NEVER a grade shortcut. A record in the correct broad food category can be0; a powder for preparing a drink can be relevant to ambiguous `drink` despite confectionery allocation.

## Semantic and functional grade algorithm (s01–s12, f01–f03)

Apply this ordered algorithm separately per intent and record:

1. Required **product AND process** must match the registered canonical concepts, not just overlapping words. Contradicted measurement, simulation-only basis, or explicit hard-constraint conflict is grade0. An exclusion flag documents a hard mismatch, not a searchable label; C verifies its actual meaning. No false positive from an exact query word alone.
2. For s02 and s10, a documented downloadable CSV is a hard requirement. PDF-only with identical content is0, not3 or2. Other intents impose no hard format restriction. A CSV advertised only in a nested distribution is sufficient if actual searchable evidence supports the required content. Missing distribution evidence is unsupported, not presumed available.
3. With product/process/constraint/required format satisfied, count supported required measurement facts: all3 => **3 direct**; exactly2 => **2 materially useful**; exactly1 => **1 tangential**; none => **0 irrelevant**. Required facts and omitted/contradictory facts are explicit per record. These are independently documented measurement columns, NOT ontological attributes implied by product/process: a liquid dairy product remains liquid dairy even when microbial counts are absent; a running shoe remains for running even when water-film measurements are absent. Missing a measurement column is not equivalent to denying a product attribute, but an undocumented measurement cannot be invented to raise a grade.
4. No cross-product/category default relevance. The exact structured product/process conditions and all grades are frozen. A conceptual dispute or metadata failure is `U`, not a post hoc redefinition. Main must resolve/re-freeze BEFORE search or treat the comparison as incomplete.

The expected constraints are representative measurements, not simulation-only values. Grade2 is incomplete yet useful evidence, not a wrong product/process. Known hard negatives deliberately retain plausible nearby language but fail product, process, required measure, hard data basis or file format. The generator must explain the wrong measure/process naturally, NOT insert `wrong_process`, intent IDs, relevance labels, query lists or rejection explanations into indexed fields.

## Semantic intent facts

| Intent | Product/process | Three required measurement facts | Special hard constraint |
|---|---|---|---|
|s01|cacao crop / field pest management|pest counts; control treatment; treatment application rate|observed field evidence|
|s02|cacao crop / harvest yield|harvest mass; hectares; season|CSV|
|s03|cacao beans / bean fermentation|duration; bean temperature; batch mass kg|not cultured beverage fermentation|
|s04|cacao seedlings / nursery propagation|survival; propagation method; rooting duration days|crop, not factory sanitation|
|s05|solid milk chocolate / bar packaging|wrapper material; barrier performance; seal failure rate|not chocolate-milk liquid|
|s06|solid chocolate / texture testing|fracture force; tempering conditions; particle size micrometres|not liquid viscosity or soft filling|
|s07|dessert chocolate ingredient / storage|storage temperature; ingredient quality; moisture percent|not finished dairy drink or packaging alone|
|s08|confectionery factory / sanitation|equipment cleaning; microbial swabs; residue mass mg|factory, not seedling/crop plant|
|s09|drinking chocolate powder / hot-drink reconstitution|powder dose; water temperature; dissolution time seconds|not baking-only powder|
|s10|chocolate dairy beverage / refrigerated shelf life|storage temperature; spoilage days; microbial count CFU/ml|CSV; not bar, oat drink or ambient logistics|
|s11|chocolate dairy beverage / formulation|cocoa fraction; sugar fraction; liquid viscosity|not dessert ingredients or container design|
|s12|chocolate dairy beverage / fermentation|starter culture; acidification curve; residual sugar g/litre|not postharvest beans or pasteurization|
|f01|running shoe / wet pavement testing|wet friction coefficient; surface roughness mm; water-film depth mm|not a component alone or dry-surface test|
|f02|hydraulic pump / low-noise testing|noise decibels; sound measurement distance m; flow rate|not interface standard or unloaded inventory|
|f03|temperature probe / coldroom calibration|calibration error; range -20 to +5 C; reference-instrument uncertainty C|not torque gauge or price sheet|

## Exact lookup controls (x01–x24)

Grade3 iff the dataset's stable ID is in the query's frozen `authoritative_target_ids`; all other IDs grade0 for that lookup, regardless of descriptive similarity. Do not LLM-judge objective equality, give partial exact credit for a sole/lace/version, or infer that a token occurrence in a parent record means its child record is the target. Explicit RUN-X120 case/hyphen aliases point to ONE SKU b001; I/1, O/0, component, version, prefix and suffix changes are different identities. Fictional ZTS standards are controlled technical identifiers, not claims that such a real standard exists.

Distribution-only and title-only cases have registered placement requirements. V2 pre-generation amendment, preserving v1 under `registration-history/v1`: for b029/b030, title-only restricts PRIMARY metadata fields (title permitted; description/keywords/publisher/distributions forbidden). Exact production Title+Description projection is mandatory and may repeat the title identifier; this is not an additional primary metadata scope. The derived queryContext and its embedding input must remain unredacted and contain no independently inserted identifiers. Distribution-only b027/b028 scope is unchanged: their identifiers stay only in nested distributions, absent from dataset primary fields and derived queryContext. This compatibility clarification changes no query, target or relevance grade. Actual production analyzers may conflate strings: report the failure while preserving frozen target expectations, never add an unconfigured keyword field or equality query. Collision counts use only `near_identifier_ids`, not all corpus non-targets.

Every exact query is **critical**. Compare its first authoritative target's actual returned rank against baseline; worse rank (including top10 disappearance) is a critical displacement, even when both systems still return it top5. Rank ties use actual engine return order. Missing target rank is infinity. Top1 is correct only when rank1's dataset identity is authoritative. Multiple authoritative targets, if introduced by an approved pre-run amendment, use best target rank but must all represent the same declared need.

## Exploratory ambiguity and no-answer diagnostics

For d01–d04 the explicitly frozen process-to-grade maps override the disambiguated semantic algorithm: these short queries have no requested measurements, CSV or simulation exclusion. Multiple meanings are valid. `plant` can mean seedling or factory; `drink` includes powder intended for drink preparation; `dessert` includes ingredients and finished-product evidence; `storage` includes ingredient, refrigerated beverage and relevant packaging. A grade is not a whole-domain preference. Show interpretation diversity and top10 cases separately, never require one family to win and never pool these into promotion NDCG.

n01 and n02 deliberately lack the required conjunction anywhere in the corpus; C checks absence over ALL searchable fields. Their maps are all0, so IDCG is0/undefined. Exclude from ordinary NDCG/Success/MRR and the positive-intent mean. Report whether returned metadata supports only a nearby concept and whether empty/nonempty responses are appropriate, without awarding a ranking win simply for emptiness.

## Independent evidence and `U`

C must deliver one auditable record per query–doc pair, or a complete intent–doc evidence map plus an explicit independently checked paraphrase-equivalence mapping. For EVERY grade3 anchor cite field path and exact phrase(s) proving product/process/all facts/constraints/format. For EVERY named hard negative cite actual evidence of the mismatch. Validate2/1/0 rule coverage across the full matrix, not merely retrieved hits. Also inspect duplicate/contradictory metadata, seed stability, scope leakage, absent-token constraints and title templating. No record may smuggle plan labels, expected grade, target list or query text into metadata.

`U` means unsupported/contradictory/uncertain from available evidence; not0 and not proof of absence. Preserve proposed versus validated grade and evidence, never quietly coerce a missing grade to0. All scored semantic/functional intents require independently verified positive coverage and all exact targets must exist. Before scores, repair metadata to the frozen requirements or approve an auditable amendment with old/new hashes. Freeze final corpora, qrels and coverage/evidence manifest BEFORE relevance retrieval. After scores, NO repairs or tuning. Unresolved heldout/critical evidence blocks A and B, requiring C/not-run reporting. If exploratory sensitivity imputes U gain0/7, recompute IDCG consistently and label sensitivity; do not confuse it with the primary fully validated matrix.
