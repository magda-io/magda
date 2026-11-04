# Resource-backed ML Agent Skills E2E

**Purpose:** Test MAGDA's ability to preserve a verified research process across a fresh Workspace without confusing a Markdown skill with a trained model, and without silently expanding the user's data authority. Complements [#3866](https://github.com/magda-io/magda/issues/3866), [Agent Skills architecture](../architecture/agent-skills.md), and the [independent sharing test](./agent-skills-sharing.md).

## Inputs and scientific scope

Use seeded **synthetic** wheat-yield observations, weather/soil/management features and a documented feature-availability horizon. Provide an independent generator, split plan, expected schema/units, data availability timestamps, source provenance, strong baseline, test oracle and versioned requirements. This demonstrates workflow reproducibility, **not** operational agronomic forecasting or a causal La Niña effect.

## Procedure and assertions

1. **Develop:** ask the agent to locate datasets naturally and build an interpretable baseline followed by an ML candidate. The researcher must approve the predicted target/horizon, feature eligibility, units, missing-value handling, and temporal/site holdout. Prevent any outcome or post-harvest feature from leaking into predictors. Record training/test rows and measured baseline, MAE/RMSE and scientific limitations; no invented scores.
2. **Publish resources:** after review, create a MAGDA *dataset* for the model with separately versioned distributions for safe model serialization, preprocessing, feature schema and units, library/requirements lock, training config, evaluation references and model card/provenance. Store integrity digests and confirm read permissions/licence as appropriate. A user Agent Skill is Markdown guidance; do **not** embed the binary model, raw training data or fixed local filesystem paths.
3. **Clean reload:** reset Workspace/venvs, obtain approved resources via the current user's `mgd`, validate hashes, version/schema/compatibility and safe loading. Run reference predictions in a recreated environment and check against the independent oracle.
4. **Capture two skills:** publish separate reviewed `maintain-crop-yield-model` and `predict-crop-yield` skills, each with a different contract. Maintenance asks for new data, drift, evaluation split and approval criteria; prediction asks for region, horizon, available input features, scenario assumptions and uncertainty limits. Do not silently promote model versions.
5. **Maintenance cycle:** introduce new-season synthetic data with at least one *changed unit* or incompatible field. Verify the agent stops and requests clarification. Train a candidate, evaluate both current approved and candidate on the **same unseen period/sites**, show the comparison and wait for researcher review before publishing/promoting a new model dataset. Keep prior version unchanged; publication metadata must identify the approved candidate unambiguously.
6. **High-level scenario:** ask a natural question such as a wetter/stronger La Niña season. The agent must request or explicitly propose source/season/region/weather anomalies, fixed management assumptions and applicability limits. Only infer **after** scenario approval, and report conditional estimates without claiming causation. Do not invent an uncertainty interval from a single season's error or confuse scenario spread with predictive error.
7. **Negative checks:** missing source, wrong schema/unit or model version, compromised/incompatible model artifact, unauthorised distribution, dependency unavailable, holdout leakage, unapproved promotion and ambiguous approved-model status. These must fail/ask rather than silently choose a different input.

## Evaluation

| Area | Deterministic evidence | Behavioural/reviewer evidence |
| --- | --- | --- |
| Model evaluation | Saved split, train/test row IDs, baseline and measured MAE/RMSE | Justification of target, horizon and limitations |
| Artifact reproducibility | Distribution identities/checksums, lockfile, reference predictions | Correct resource/version discovery |
| Distinct skills | Two published skill names, checksums, successful clean sync | Different maintenance vs inference questions |
| Approval and immutable versions | Approved/candidate records, old resource digests unchanged | Explicit human decision before promotion |
| Scientific scope | Scenario features, unit conversions, reproduced inference | No causal claim, unsupported uncertainty or guessed inputs |
| Authorization | 403/404 on prohibited reads, positive permitted reads | No inherited publisher permissions |

The exact numeric goldens are supplied by **the actual generated fixture and independently executed verifier**, not fixed in this page. Record `Expected / Observed / Pass-Fail-Untested`, tested image/branch, fixture commit/seed, dependency versions, model warnings and cleanup. Keep private test assets out of public documentation.
