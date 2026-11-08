"""Adapter tests use tiny invented artifacts, never actual benchmark outcomes."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("threshold_adapter_tested", Path(__file__).with_name("analysis_inputs.py"))
a = importlib.util.module_from_spec(spec)
spec.loader.exec_module(a)
H = "a" * 64


def write_ref(directory, name, value, fmt="json"):
    path = Path(directory) / name
    raw = ("\n".join(json.dumps(r, sort_keys=True) for r in value) + "\n") if fmt == "jsonl" else json.dumps(value, sort_keys=True)
    path.write_text(raw)
    return dict(path=str(path.resolve()), sha256=a.sha_bytes(path.read_bytes()), format=fmt)


def case(cohort="NEW", size=2, seed=1):
    return dict(cohort=cohort, catalog_size=size, seed=seed, index="tiny-owned-index", corpus="tiny.jsonl")


def receipt():
    simple = dict(id="a", rank=1, score=1)
    root = dict(simple, source_identity={"identifier": "a"})
    child = dict(id="a", rank=1, score=.4, _nested={"field": "distributions", "offset": 0},
                 source_identity={"identifier": "child-a"})
    return dict(seed=1, index="tiny-owned-index", system="topk10diag", query_id="q", hits=[simple],
                aggregations={}, total_hits={"value": 1, "relation": "eq"}, parsed_json_sha256=H,
                request_started_utc="2026-11-07T03:00:00Z", request_completed_utc="2026-11-07T03:00:01Z",
                all_hit_signatures=[dict(path=["hits", "hits"], hits=[root]),
                                    dict(path=["hits", "hits", 0, "inner_hits", "d", "hits", "hits"], hits=[child])])


class ArtifactAdapterTests(unittest.TestCase):
    def test_bound_source_hash_and_format_no_discovery(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            ref = write_ref(directory, "tiny.jsonl", [{"grade": "U"}], "jsonl")
            rows, observed = a.read_bound(ref)
            self.assertEqual([{ "grade": "U"}], rows)
            self.assertEqual(ref["sha256"], observed["sha256"])
            Path(ref["path"]).write_text("[]")
            with self.assertRaisesRegex(ValueError, "Source SHA"):
                a.read_bound(ref)

    def test_manifest_case_identity_not_caller_freedom(self):
        row = dict(seed=1, query_id="q", system="ms_045", config={"index": "tiny-owned-index"}, hits=[])
        original = copy.deepcopy(row)
        out = a.inject_case([row], case())[0]
        self.assertEqual(("NEW", 1, 2), (out["cohort"], out["seed"], out["size"]))
        self.assertEqual(original, row)
        with self.assertRaises(ValueError):
            a.inject_case([dict(row, seed=2)], case())
        with self.assertRaises(ValueError):
            a.inject_case([dict(row, config={"index": "other-index"})], case())

    def test_receipt_preserves_original_child_identity_and_UTC(self):
        raw = receipt()
        out = a.inject_case([raw], case(), receipt=True)[0]
        self.assertEqual(raw["all_hit_signatures"], out["source_all_hit_signatures"])
        self.assertEqual(raw["all_hit_signatures"][1], out["all_hit_signatures"][1])
        self.assertEqual(out["hits"], out["all_hit_signatures"][0]["hits"])
        self.assertEqual(raw["request_started_utc"], out["request_started_utc"])
        self.assertEqual("topk10diag", out["system"])  # Explicit analyzer normalization remains later.
        self.assertIn("source_identity", raw["all_hit_signatures"][0]["hits"][0])

    def test_receipt_missing_surfaces_not_invented_empty(self):
        raw = receipt()
        raw.pop("aggregations")
        with self.assertRaisesRegex(ValueError, "Incomplete source receipt"):
            a.inject_case([raw], case(), receipt=True)
        raw = receipt()
        raw["all_hit_signatures"][0]["hits"][0]["id"] = "other"
        with self.assertRaisesRegex(ValueError, "disagree"):
            a.inject_case([raw], case(), receipt=True)

    def test_corpus_descriptors_actual_IDs_and_subset(self):
        core = case(size=60)
        growth = case(size=61)
        documents = {a.case_key(core): [{"identifier": str(i)} for i in range(60)],
                     a.case_key(growth): [{"identifier": str(i)} for i in range(61)]}
        result = a.corpus_descriptors([core, growth], documents)
        self.assertEqual(result[0]["ids"], result[1]["core_ids"])
        documents[a.case_key(growth)][0]["identifier"] = "not-core"
        with self.assertRaisesRegex(ValueError, "Core IDs"):
            a.corpus_descriptors([core, growth], documents)

    def test_legacy_U_never_zero_or_seedless(self):
        row = dict(seed=39031, query_id="q", dataset_id="a057", grade="U")
        out = a.legacy_qrels([row])[0]
        self.assertEqual("U", out["grade"])
        self.assertEqual(("LEGACY", 180), (out["cohort"], out["size"]))
        with self.assertRaises(ValueError):
            a.legacy_qrels([dict(query_id="q", dataset_id="a", grade=0)])
        self.assertNotIn("cohort", row)

    def branch_fixture(self):
        q = dict(id="q", intent_id="f", kind="semantic")
        qr = [dict(seed=1, size=60, query_id="q", dataset_id="a", grade=2)]
        contexts = [dict(facts={"x": [dict(field="distributions.0.description", quote="x observed")],
                                "y": [dict(field="distributions.0.description", quote="y observed")]})]
        row = dict(seed=1, size=60, dataset_id="a", actual_raw_record_sha256=H,
                   actual_contexts_with_literal_quotes=contexts,
                   branch_measurement_support={"f": {"nested.0": {"facts": ["x", "y"], "useful_measurement_complete": True}}})
        return q, qr, row

    def test_C_branch_support_not_parent_grade_relevance(self):
        q, qr, row = self.branch_fixture()
        out = a.branch_evidence([row], [q], qr, H)
        self.assertEqual(1, len(out))
        self.assertEqual("nested", out[0]["branch"])
        self.assertEqual("nested.0", out[0]["source_scope"])
        self.assertEqual(2, len(out[0]["evidence_refs"]))
        qr[0]["grade"] = 3
        self.assertEqual([], a.branch_evidence([row], [q], qr, H))
        qr[0]["grade"] = "U"
        self.assertEqual([], a.branch_evidence([row], [q], qr, H))

    def test_two_incomplete_children_not_combined(self):
        q, qr, row = self.branch_fixture()
        row["branch_measurement_support"]["f"] = {
            "nested.0": {"facts": ["x"], "useful_measurement_complete": False},
            "nested.1": {"facts": ["y"], "useful_measurement_complete": False}}
        self.assertEqual([], a.branch_evidence([row], [q], qr, H))

    def test_NONE_decision_satisfies_both_schema_digests(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            inputs = dict(cases=[case()], source_sha256={})
            ir = write_ref(directory, "inputs.json", inputs)
            complete = dict(split="development", inputs_sha256=ir["sha256"], completed_utc="2026-11-07T01:00:00Z",
                            cases=[dict(cohort="NEW", seed=1, catalog_size=2)])
            cr = write_ref(directory, "complete.json", complete)
            policy = dict(promotion_allowed=False, forced_recommendation="D")
            out = a.make_decision(policy, ir, cr, timestamp_utc="2026-11-07T02:00:00Z", parent_acknowledgment="main")
            self.assertEqual(ir["sha256"], out["inputs_sha256"])
            self.assertEqual(cr["sha256"], out["development_completion_sha256"])
            self.assertEqual(a.analysis.digest({k: v for k, v in out.items() if k != "record_sha256"}), out["record_sha256"])
            self.assertIsNone(out["selected_threshold"])
            with self.assertRaisesRegex(ValueError, "predates"):
                a.make_decision(policy, ir, cr, timestamp_utc="2026-11-07T00:00:00Z", parent_acknowledgment="main")

    def test_completion_case_source_hash_and_wrong_inputs_rejected(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            directory = Path(directory)
            rr = write_ref(directory, "runs.jsonl", [], "jsonl")
            ir = write_ref(directory, "inputs.json", dict(cases=[], source_sha256={}))
            cr = write_ref(directory, "complete.json", dict(inputs_sha256=ir["sha256"], files_sha256={"runs.jsonl": rr["sha256"]}))
            sources = a.Sources(directory, ir, [cr])
            self.assertEqual([], sources.read("runs.jsonl"))
            with self.assertRaisesRegex(ValueError, "absent"):
                sources.read("unlisted.jsonl")
            bad = write_ref(directory, "bad.json", dict(inputs_sha256=H))
            with self.assertRaisesRegex(ValueError, "different execution"):
                a.Sources(directory, ir, [bad])

    def test_full_tiny_projection_writes_analyzer_payload_no_metric_framework(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            w = Path(directory).resolve()
            execution_root = w / "execution"
            target = execution_root / "NEW" / "1" / "2"
            target.mkdir(parents=True)
            corpus = write_ref(w, "tiny.jsonl", [{"identifier": "a"}, {"identifier": "b"}], "jsonl")
            c = case()
            inp = dict(cases=[c], source_sha256={"tiny.jsonl": corpus["sha256"]})
            ir = write_ref(w, "execution-inputs.json", inp)
            qs = [dict(id="dev", intent_id="f1", kind="semantic", split="development"),
                  dict(id="held", intent_id="f2", kind="semantic", split="heldout")]
            gates = a.analysis.default_gates()
            names = [s["id"] for s in gates["registered_systems"]] + ["topk10diag"]
            mixed = [gates["diagnostic_ids"][k] for k in ("dataset045_nested050", "dataset050_nested045")]
            files = {}
            for phase, ids, systems in (("development", ["dev"], names), ("heldout", ["held"], names), ("roles", ["dev", "held"], mixed)):
                rs, rr = [], []
                for qid in ids:
                    for system in systems:
                        rs.append(dict(seed=1, query_id=qid, system=system, hits=[], config={"index": c["index"]},
                                       latency_samples_ms=[1] * 10, latency_scope="local_warmed", warmup=False))
                        for i in range(11):
                            r = receipt()
                            r.update(query_id=qid, system=system, hits=[], phase="warmup" if i == 0 else "measured",
                                     warmup=i == 0, repetition=i, elapsed_ms=1, request_sha256=H,
                                     all_hit_signatures=[dict(path=["hits", "hits"], hits=[])])
                            rr.append(r)
                for suffix, rows in (("runs", rs), ("receipts", rr)):
                    ref = write_ref(target, phase + "-" + suffix + ".jsonl", rows, "jsonl")
                    files[str(Path(ref["path"]).relative_to(w))] = ref["sha256"]
            refs = {}
            values = dict(queries=qs, intents=[], gates=gates, generation_spec={"fixed_score_diagnostic_pairs": []},
                          new_qrels=[dict(cohort="NEW", seed=1, size=2, query_id=q["id"], dataset_id=d, grade=3 if d == "a" else 0) for q in qs for d in ("a", "b")],
                          expanded_evidence=[], diagnostic_policy=dict(promotion_allowed=False, forced_recommendation="D", uncertainty_pairs=[]),
                          selection={"record_sha256": H}, analysis_bindings={"raw_to_analysis_system_mapping": a.MAPPING},
                          native_scores=[], eligibility=[], vector_inventory=[],
                          preparation={"started_utc": "2026-11-07T00:00:00Z"})
            for name, value in values.items():
                refs[name] = write_ref(w, name + ".json", value)
                if name in ("native_scores", "eligibility", "vector_inventory"):
                    files[name + ".json"] = refs[name]["sha256"]
            complete = write_ref(w, "complete.json", dict(inputs_sha256=ir["sha256"], files_sha256=files))
            outdir = w / "search-relevance-eval/threshold/.local/analysis-inputs/tiny"
            output = a.prepare_inputs(workspace=w, execution_inputs=ir, execution_root=execution_root,
                                      completion_refs=[complete], source_refs=refs, output_dir=outdir)
            payload, _ = a.read_bound(output)
            self.assertEqual(20, len(payload["runs"]))
            self.assertEqual(220, len(payload["receipts"]))
            self.assertFalse(payload["evidence"]["supplementary_validation_passed"])
            self.assertTrue(payload["evidence"]["all_repetition_surface_checks_passed"])
            self.assertTrue(payload["evidence"]["mandatory_branch_diagnostics_complete"])
            transform = outdir / "source_transforms.json"
            tr = dict(path=str(transform), sha256=a.sha_bytes(transform.read_bytes()), format="json")
            manifest = a.verify_source_transforms(tr, a.sha_bytes(Path(a.__file__).read_bytes()))
            self.assertFalse(manifest["promotion_allowed"])
            Path(corpus["path"]).write_text("[]")
            with self.assertRaises(ValueError):
                a.verify_source_transforms(tr, a.sha_bytes(Path(a.__file__).read_bytes()))

    def test_adapter_output_scope_is_exclusive(self):
        with tempfile.TemporaryDirectory(dir=Path(__file__).parent) as directory:
            ir = write_ref(directory, "inputs.json", dict(cases=[], source_sha256={}))
            with self.assertRaisesRegex(ValueError, "writes only"):
                a.prepare_inputs(workspace=directory, execution_inputs=ir, execution_root=directory,
                    completion_refs=[], source_refs={}, output_dir=str(Path(directory) / "other"))


if __name__ == "__main__":
    unittest.main()
