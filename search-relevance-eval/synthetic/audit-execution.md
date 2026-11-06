# Independent actual-text review execution record — #3903

This record is an execution log, not an additional relevance rule or a claim that an incomplete gate passed.

- Original information needs, labels, IDs and seeds were frozen before generation; the compatibility revision preserves them exactly.
- The generator's first realized descriptions had repeated padding. Both generator self-review and independent C review caught this **before any target-query embeddings or ranking**. First bytes/hashes are preserved; corrected realization v2 was independently preflighted before full observations.
- Eighteen fresh contexts review 30 actual records each (ten stable IDs across three seeds), totaling540. They receive the actual primary searchable text, global unassociated concept vocabulary/intents, observation schema and named contrast intents—not generator code, per-record intended grades, per-record claim sidecars, embeddings, systems, scores or rankings.
- Exact production queryContext copies are checked and omitted from packets only as duplicated text; no independently authored searchable evidence is truncated. Auditors must read all fields, quote exact field paths/text, distinguish absent variables from measured ones, and flag contradictions rather than forcing agreement.
- Available model label: `gpt-6.1-sol`; temperature/top-p/exact service snapshot and internal sampling controls are not exposed. Fresh contexts are correlated model judgments, not independent human validation.
- Initial scheduling job `workflow-7968662b560a48b4` failed at the child-start concurrency limit; it did not produce a completed review set. It was collected, not silently counted as successful. Bounded four-worker execution uses `workflow-2606bc77765641fc`, preserving all individual raw outputs.
- Raw reviews are authoritative observations, not automatically accepted labels. C checks exact citations/provenance, independently derives grades, compares the complete frozen matrix, and withholds the retrieval gate for unsupported positives, contradictions or unresolved review concerns.
- Early partial integration is allowed to identify fixture defects **before** scoring. It cannot claim global answerability. Original U/issues remain preserved. Any factual text repair must have explicit old/new hashes, no query/criteria/expected-grade changes and new independent review of changed text; unchanged reviews may be reused only after exact record equality checks.

## Fresh auditor prompt substance

Each context is instructed to read only [validation-prompt.md](validation-prompt.md) and its assigned actual-text packet. It infers product, process, empirical/simulation basis, all documented required measurements and identity from literal positive evidence; vocabulary alone is not evidence. It independently explains every named near-miss or flags disagreement, validates actual distribution formats/content association, checks all three realizations, and writes the embedded schema with reviewer provenance. It outputs **observations, not expected/proposed relevance grades**. The C validator computes labels separately from those observations.

Concrete packet/source hashes, individual raw outputs, query-equivalence review and any subsequent correction/adjudication provenance are retained with the independent validation evidence. A missing/failed review is not imputed as irrelevant or accepted as a pass.
