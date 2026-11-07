"""Mock-only raw sweep tests; mutated smoke rows are unit fixtures, NOT exports/evidence."""
import copy
import hashlib
import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

ROOT = pathlib.Path(__file__).resolve().parent


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


replay = load_module("threshold_replay_run", ROOT.parent / "run.py")
contract = load_module("threshold_replay_contract", ROOT / "export_contract.py")


def response(score=1):
    return {"hits": {"hits": [{"_id": "doc", "_score": score, "_source": {"large": "metadata"}}],
                     "total": {"value": 1, "relation": "eq"}}, "took": 2, "timed_out": False,
            "_shards": {"total": 1, "successful": 1, "failed": 0},
            "aggregations": {"facet": {"doc_count": 1, "buckets": [{"key": "CSV", "doc_count": 1,
                "top": {"hits": {"hits": [{"_id": "facet-doc", "_score": 4,
                                           "_source": {"vector": [1, 2]}}]}}}]}}}


class ThresholdReplayTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = pathlib.Path(self.temp.name)
        self.args = types.SimpleNamespace(engine_url="http://localhost:19200", index="magda-relevance-eval-unit",
                                          output=str(self.root / "out" / "results.jsonl"), raw_output=None,
                                          depth=10, repetitions=10, raw_production_only=True,
                                          compact_output=True, corpus=None, seed=73)
        smoke = replay.load_jsonl(ROOT.parent / "scala" / "smoke" / "baseline.jsonl")
        self.sets, self.configs = {}, {}
        for label, value in (("ms_050", .5), ("ms_048", .48)):
            rows = copy.deepcopy(smoke)
            config_sha = hashlib.sha256(label.encode()).hexdigest()
            for row in rows:
                row.update(baseline_commit=contract.BASELINE, config_sha=config_sha)
                row["request"]["body"]["size"] = 10
                row["request"]["query_params"].update(preference="unit context", request_cache="false")
                for _, _, payload in contract.knn_copies(row["request"]["body"]):
                    payload["min_score"] = value
            path = self.root / (label + ".jsonl")
            replay.write_jsonl(path, rows)
            self.sets[label] = path
            config = self.root / (label + ".config.json")
            config.write_text(json.dumps({"config_sha": config_sha, "elasticSearch": {"indices": {"datasets": {
                "hybridSearch": {"minScore": value, "k": None, "maxDistance": None}}}}}), encoding="utf8")
            self.configs[label] = config

    def run_replay(self, **kwargs):
        return replay.run_export_sets(self.args, self.sets, config_paths=self.configs, **kwargs)

    def assert_no_artifacts(self):
        self.assertFalse(pathlib.Path(self.args.output).parent.exists())

    def test_raw_only_zero_pipeline_or_experimental_calls_exact_export_bodies(self):
        calls = []

        def fake_request(base, method, path, body):
            calls.append((base, method, path, copy.deepcopy(body)))
            return response()

        with mock.patch.object(replay, "request", side_effect=fake_request), \
                mock.patch.object(replay, "experimental", side_effect=AssertionError("experimental called")), \
                mock.patch.object(replay, "pipeline_body", side_effect=AssertionError("pipeline called")):
            rows = self.run_replay()
        self.assertEqual(len(calls), 2 * 2 * 11)
        self.assertTrue(all(method == "POST" for _, method, _, _ in calls))
        expected = {json.dumps(row["request"]["body"], sort_keys=True)
                    for path in self.sets.values() for row in replay.load_jsonl(path)}
        self.assertEqual({json.dumps(body, sort_keys=True) for _, _, _, body in calls}, expected)
        for base, _, path, _ in calls:
            self.assertEqual(base, self.args.engine_url)
            parts = urlsplit(path)
            self.assertEqual(parts.path, "/magda-relevance-eval-unit/_search")
            self.assertEqual(parse_qs(parts.query)["search_pipeline"], ["_none"])
            self.assertEqual(parse_qs(parts.query)["preference"], ["unit context"])
            self.assertEqual(parse_qs(parts.query)["request_cache"], ["false"])
        self.assertEqual(len(rows), 4)
        self.assertTrue(all(len(row["latency_samples_ms"]) == 10 for row in rows))
        self.assertTrue(all("metadata" not in row["hits"][0] for row in rows))
        self.assertNotIn("hits", str(rows[0]["aggregations"]))
        self.assertEqual(rows[0]["aggregations"]["facet"]["buckets"][0]["doc_count"], 1)
        ledger = replay.load_jsonl(self.args.output + ".repetitions.jsonl")
        self.assertEqual(len(ledger), 44)
        for receipt in ledger:
            self.assertEqual(receipt["parsed_json_sha256"], hashlib.sha256(json.dumps(response(), sort_keys=True).encode()).hexdigest())
            self.assertFalse(receipt["full_response_body_stored"])
            self.assertEqual(receipt["seed"], 73)
            self.assertEqual(receipt["total_hits"], response()["hits"]["total"])
            self.assertEqual(receipt["shards"], response()["_shards"])
            self.assertIn("facet-doc", str(receipt["all_hit_signatures"]))
            self.assertNotIn("_source", str(receipt))
        provenance = replay.load_jsonl(self.args.output + ".requests.jsonl")
        self.assertEqual(provenance[0]["kind"], "export_set_validation")
        self.assertEqual(len(provenance), 5)
        for record in provenance[1:]:
            self.assertEqual(record["source_search_pipeline"], "magda-datasets-hybrid-search")
            self.assertEqual(record["replay_search_pipeline"], "_none")
            self.assertEqual(record["export_request_sha256"],
                             hashlib.sha256(contract.canonical(record["export"]["request"])).hexdigest())
        for qid in ("smoke-unfiltered", "smoke-filtered"):
            receipts = [item for item in ledger if item["query_id"] == qid]
            order = replay.rotation_order(qid, ("ms_050", "ms_048"))
            expected_schedule = [(system, "warmup", 0) for system in order]
            expected_schedule += [(system, "measured", rep + 1) for rep in range(10)
                                  for system in replay.measurement_order(order, rep)]
            self.assertEqual([(r["system"], r["phase"], r["repetition"]) for r in receipts], expected_schedule)

    def test_contract_rejects_stale_nested_and_facet_copies_before_writes(self):
        rows = replay.load_jsonl(self.sets["ms_048"])
        copies = contract.knn_copies(rows[0]["request"]["body"])
        for path, _, _ in copies:
            changed = copy.deepcopy(rows)
            contract.at(changed[0]["request"]["body"], path)["min_score"] = .5
            replay.write_jsonl(self.sets["ms_048"], changed)
            with mock.patch.object(replay, "request") as request, self.assertRaises(ValueError):
                self.run_replay()
            request.assert_not_called()
            self.assert_no_artifacts()

    def test_query_id_duplicates_and_missing_rejected_before_validator_or_writes(self):
        original = replay.load_jsonl(self.sets["ms_048"])
        for changed in (original + [original[0]], original[:1], [dict(original[0], query_id=None)]):
            replay.write_jsonl(self.sets["ms_048"], changed)
            validator = mock.Mock()
            with mock.patch.object(replay, "request") as request, self.assertRaises(ValueError):
                self.run_replay(validate_request_sets=validator)
            validator.assert_not_called()
            request.assert_not_called()
            self.assert_no_artifacts()

    def test_public_url_unowned_index_and_missing_raw_ack_rejected(self):
        for key, bad in (("engine_url", "https://dev.magda.io"), ("index", "datasets54"),
                         ("raw_production_only", False), ("depth", 0), ("repetitions", 0)):
            old = getattr(self.args, key)
            setattr(self.args, key, bad)
            with mock.patch.object(replay, "request") as request, self.assertRaises(ValueError):
                self.run_replay()
            request.assert_not_called()
            self.assert_no_artifacts()
            setattr(self.args, key, old)

    def test_config_hash_and_export_size_reject_before_writes(self):
        for change in ("hash", "size"):
            original = replay.load_jsonl(self.sets["ms_048"])
            changed = copy.deepcopy(original)
            if change == "hash":
                changed[0]["config_sha"] = "0" * 64
            else:
                changed[0]["request"]["body"]["size"] = 50
            replay.write_jsonl(self.sets["ms_048"], changed)
            with mock.patch.object(replay, "request") as request, self.assertRaises(ValueError):
                self.run_replay()
            request.assert_not_called()
            self.assert_no_artifacts()
            replay.write_jsonl(self.sets["ms_048"], original)

    def test_existing_artifact_or_input_target_never_overwritten(self):
        self.args.output = str(self.root / "existing")
        pathlib.Path(self.args.output).write_text("preserve", encoding="utf8")
        with mock.patch.object(replay, "request") as request, self.assertRaises(FileExistsError):
            self.run_replay()
        request.assert_not_called()
        self.assertEqual(pathlib.Path(self.args.output).read_text(), "preserve")
        self.args.output = str(self.sets["ms_050"])
        before = self.sets["ms_050"].read_bytes()
        with self.assertRaises(ValueError):
            self.run_replay()
        self.assertEqual(self.sets["ms_050"].read_bytes(), before)

    def test_timeout_failure_and_exception_abort_keep_ledger_no_reruns(self):
        for kind in ("timeout", "shards", "exception"):
            self.args.output = str(self.root / kind / "results")
            failed = response()
            if kind == "timeout":
                failed["timed_out"] = True
            elif kind == "shards":
                failed["_shards"]["failed"] = 1
            effect = [response(), TimeoutError("unit timeout") if kind == "exception" else failed]
            with mock.patch.object(replay, "request", side_effect=effect) as request, self.assertRaises((ValueError, TimeoutError)):
                self.run_replay()
            self.assertEqual(request.call_count, 2)
            ledger = replay.load_jsonl(self.args.output + ".repetitions.jsonl")
            self.assertEqual(len(ledger), 2)
            if kind == "exception":
                self.assertEqual(ledger[-1]["error_type"], "TimeoutError")
            else:
                self.assertIn("parsed_json_sha256", ledger[-1])
            self.assertTrue(pathlib.Path(self.args.output + ".requests.jsonl").stat().st_size)

    def test_every_repetition_retained_and_instability_flagged(self):
        counter = 0

        def changing(*_):
            nonlocal counter
            counter += 1
            return response(counter)

        with mock.patch.object(replay, "request", side_effect=changing):
            rows = self.run_replay()
        self.assertTrue(all(row["repeat_instability"] for row in rows))
        self.assertTrue(all(len(row["ranking_score_variants"]) == 10 for row in rows))
        self.assertEqual(len(replay.load_jsonl(self.args.output + ".repetitions.jsonl")), 44)

    def test_each_measured_timing_matches_ledger_and_excludes_warmup(self):
        ticks = [tick for index in range(44) for tick in (index * 3, index * 3 + (index + 1) / 1000)]
        with mock.patch.object(replay, "request", side_effect=lambda *_: response()), \
                mock.patch.object(replay.time, "perf_counter", side_effect=ticks):
            rows = self.run_replay()
        ledger = replay.load_jsonl(self.args.output + ".repetitions.jsonl")
        for row in rows:
            expected = [item["elapsed_ms"] for item in ledger if item["query_id"] == row["query_id"]
                        and item["system"] == row["system"] and item["phase"] == "measured"]
            self.assertEqual(row["latency_samples_ms"], expected)
            self.assertEqual(len(expected), 10)
            self.assertEqual(row["latency_ms"], replay.statistics.median(expected))
        self.assertEqual(len([item for item in ledger if item["phase"] == "warmup"]), 4)

    def test_nested_child_identity_keeps_offsets_and_only_actual_source_identifiers(self):
        raw = response()
        parent = raw["hits"]["hits"][0]
        parent.update(_id="parent-id", _source={"identifier": "dataset-id", "queryContextVector": [99]})
        parent["inner_hits"] = {"distributions": {"hits": {"total": {"value": 3, "relation": "eq"}, "hits": [
            {"_id": "parent-id", "_score": 3, "_nested": {"field": "distributions", "offset": 0},
             "_source": {"identifier": "child-a", "distribution_id": "dist-a", "queryContextVector": [88]}},
            {"_id": "parent-id", "_score": 2,
             "_nested": {"field": "distributions", "offset": 1, "_nested": {"field": "items", "offset": 2}},
             "_source": {"identifier": "child-b", "title": "not retained", "distributions": [{"vector": [77]}]}},
            {"_id": "parent-id", "_score": 1, "_nested": {"field": "distributions", "offset": 2},
             "_source": {"title": "no fabricated identifier"}}
        ]}}}
        original = copy.deepcopy(raw)
        receipt = replay.export_response_receipt(raw)
        self.assertEqual(raw, original)
        self.assertEqual(receipt["parsed_json_sha256"], hashlib.sha256(json.dumps(raw, sort_keys=True).encode()).hexdigest())
        signatures = receipt["all_hit_signatures"]
        top = next(item for item in signatures if item["path"] == ["hits", "hits"])
        self.assertEqual(top["hits"][0]["source_identity"], {"identifier": "dataset-id"})
        nested = next(item for item in signatures if "inner_hits" in item["path"])
        children = nested["hits"]
        self.assertEqual([child["id"] for child in children], ["parent-id"] * 3)
        self.assertEqual([child["_nested"]["offset"] for child in children], [0, 1, 2])
        self.assertEqual(children[0]["source_identity"], {"identifier": "child-a", "distribution_id": "dist-a"})
        self.assertEqual(children[1]["source_identity"], {"identifier": "child-b"})
        self.assertEqual(children[1]["_nested"]["_nested"], {"field": "items", "offset": 2})
        self.assertNotIn("source_identity", children[2])
        serialized = json.dumps(receipt)
        for forbidden in ("queryContextVector", "vector", "title", "_source"):
            self.assertNotIn(forbidden, serialized)

    def test_cli_defaults_and_fixed_labels(self):
        args = replay.parser().parse_args(["run-exports", "--engine-url", "http://localhost:19200",
            "--index", self.args.index, "--output", self.args.output, "--request-set", "ms_050=a",
            "--config-set", "ms_050=b", "--raw-production-only"])
        self.assertTrue(args.compact_output)
        self.assertEqual(args.repetitions, 10)
        self.assertEqual(args.depth, 10)
        for values in (["arbitrary=a"], ["ms_050=a", "ms_050=b"], ["ms_050="], []):
            with self.assertRaises(ValueError):
                replay.labelled_paths(values)


if __name__ == "__main__":
    unittest.main()
