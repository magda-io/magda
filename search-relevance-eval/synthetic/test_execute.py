"""Offline adapters/receipts only: no generated benchmark data or network."""
import copy
import importlib.util
import json
import pathlib
import tempfile
import unittest
from types import SimpleNamespace
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


execute = load("synthetic_execute_tests", ROOT / "execute.py")
replay = execute.replay
parent_tests = load("synthetic_parent_replay_tests", ROOT.parent / "test_run.py")


class ExtensionTests(unittest.TestCase):
    def test_default_seven_and_explicit_eight(self):
        self.assertEqual(replay.selected_systems(), replay.SYSTEMS)
        self.assertEqual(len(replay.selected_systems()), 7)
        self.assertEqual(replay.selected_systems("baseline,raw_boost1"), ("baseline", "raw_boost1"))
        self.assertEqual(replay.selected_systems('["raw_boost1"]'), ("raw_boost1",))
        for value in ([], "baseline,baseline", "new_weight", {"baseline": 1}, [1]):
            with self.assertRaises(ValueError):
                replay.selected_systems(value)
        self.assertIsNone(replay.parser().parse_args(["run", "--engine-url", "http://127.0.0.1:19200",
            "--index", "magda-relevance-eval-test", "--requests", "a", "--corpus", "b", "--output", "c"]).systems)

    def test_raw_boost1_changes_only_exact_root_field(self):
        body = parent_tests.fixture()
        # Give nested kNN its own boost to detect overly broad boost stripping.
        for knn in parent_tests.named(body, "knn"):
            if "distributions.queryContextVector" in knn:
                knn["distributions.queryContextVector"]["boost"] = 17
        before = copy.deepcopy(body)
        current = replay.experimental(body, "raw_boost1")
        expected = copy.deepcopy(body)
        for knn in parent_tests.named(expected, "knn"):
            if "queryContextVector" in knn:
                knn["queryContextVector"].pop("boost")
        self.assertEqual(current, expected)
        self.assertEqual(body, before)
        self.assertEqual(parent_tests.named(current, "hybrid"), parent_tests.named(expected, "hybrid"))
        self.assertEqual(parent_tests.named(current, "function_score"), parent_tests.named(expected, "function_score"))
        for knn in parent_tests.named(current, "knn"):
            if "distributions.queryContextVector" in knn:
                self.assertEqual(knn["distributions.queryContextVector"]["boost"], 17)
        self.assertFalse("post_filter" in current)
        with self.assertRaises(ValueError):
            replay.experimental(body, "unknown")

    def test_quality_and_spatial_function_placement_is_structurally_preserved(self):
        body = parent_tests.fixture()
        # Structural fixture only: fixed generic envelope, not production-exported
        # geography or a claim that normalization preserves the final multiplier.
        generic_spatial = {"weight": 1, "filter": {"geo_shape": {"spatial.geoJson": {
            "shape": {"type": "envelope", "coordinates": [[150, -30], [151, -31]]},
            "relation": "intersects"}}}}
        root = body["query"]["function_score"]
        root["functions"] = [{"weight": 1}, {"field_value_factor": {"field": "quality", "missing": 1},
            "filter": {"term": {"hasQuality": True}}}, generic_spatial]
        root["score_mode"] = "sum"
        before = copy.deepcopy(body)
        for system in replay.SYSTEMS + replay.EXTRA_SYSTEMS:
            current = replay.experimental(body, system)
            expected_count = 2 if system.startswith("candidate") else 1
            scorers = parent_tests.named(current["query"], "function_score")
            self.assertEqual(len(scorers), expected_count)
            for scorer in scorers:
                self.assertEqual(scorer["functions"], root["functions"])
                self.assertEqual(scorer["score_mode"], "sum")
        self.assertEqual(body, before)

    def test_response_receipt_keeps_counts_not_large_facet_sources(self):
        response = {"hits": {"total": {"value": 1, "relation": "eq"}, "hits": [
            {"_id": "one", "_score": 2, "_source": {"queryContextVector": [9]}}]},
            "aggregations": {"publishers": {"buckets": [{"key": "x", "doc_count": 1,
                "sample": {"hits": {"hits": [{"_source": {"queryContextVector": [9]}}]}}}]}},
            "timed_out": False, "_shards": {"failed": 0}, "took": 3}
        receipt = replay.response_receipt(response, warmup=False)
        self.assertEqual(receipt["hits"], [{"id": "one", "rank": 1, "score": 2}])
        self.assertEqual(receipt["aggregations"]["publishers"]["buckets"][0]["doc_count"], 1)
        self.assertNotIn("queryContextVector", json.dumps(receipt))
        self.assertNotIn("_source", json.dumps(receipt))
        self.assertEqual(len(receipt["parsed_json_sha256"]), 64)

    def test_runner_interleaves_and_keeps_every_response(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            requests, corpus = root / "requests.jsonl", root / "corpus.jsonl"
            replay.write_jsonl(requests, [{"query_id": "unit", "request": {"body": parent_tests.fixture()}}])
            replay.write_jsonl(corpus, [])
            args = SimpleNamespace(allow_local_writes=True, index="magda-relevance-eval-unit", requests=requests,
                corpus=corpus, engine_url="http://127.0.0.1:19200", output=str(root / "runs.jsonl"),
                depth=10, repetitions=5, systems=("baseline", "raw_boost1"), raw_output=root / "raw.jsonl", seed=39031)
            response = {"hits": {"hits": [{"_id": "unit", "_score": 1}], "total": {"value": 1, "relation": "eq"}},
                        "_shards": {"failed": 0}, "timed_out": False}
            with mock.patch.object(replay, "request", return_value=response) as request:
                replay.run(args)
            self.assertEqual(sum(call.args[1] == "PUT" for call in request.call_args_list), 2)
            ledger = replay.load_jsonl(args.raw_output)
            self.assertEqual(len(ledger), 12)
            self.assertEqual(sum(row["warmup"] for row in ledger), 2)
            self.assertEqual({row["latency_scope"] for row in ledger}, {"local_warmed"})
            self.assertEqual({row["seed"] for row in ledger}, {39031})
            measured = ledger[2:]
            for offset in range(0, 10, 2):
                self.assertEqual({row["system"] for row in measured[offset:offset + 2]}, {"baseline", "raw_boost1"})
            rows = replay.load_jsonl(args.output)
            self.assertTrue(all(len(row["latency_samples_ms"]) == 5 for row in rows))
            self.assertTrue(all(row["warmup"] is False for row in rows))
            with mock.patch.object(replay, "request") as request, self.assertRaises(FileExistsError):
                replay.run(args)
            request.assert_not_called()

    def test_error_and_failed_warmup_persist_before_abort(self):
        for response in ({"hits": {"hits": []}, "timed_out": True}, RuntimeError("offline failure")):
            with self.subTest(response=response), tempfile.TemporaryDirectory() as temp:
                root = pathlib.Path(temp)
                replay.write_jsonl(root / "requests", [{"query_id": "unit", "request": {"body": parent_tests.fixture()}}])
                replay.write_jsonl(root / "corpus", [])
                args = SimpleNamespace(allow_local_writes=True, index="magda-relevance-eval-unit", requests=root / "requests",
                    corpus=root / "corpus", engine_url="http://127.0.0.1:19200", output=str(root / "runs"),
                    depth=10, repetitions=1, systems=("baseline",), raw_output=root / "raw")
                def request(_base, method, _path, _body):
                    if method == "PUT":
                        return {}
                    if isinstance(response, Exception):
                        raise response
                    return response
                with mock.patch.object(replay, "request", side_effect=request), self.assertRaises((ValueError, RuntimeError)):
                    replay.run(args)
                ledger = replay.load_jsonl(args.raw_output)
                self.assertEqual(len(ledger), 1)
                self.assertTrue(ledger[0]["warmup"])
                self.assertFalse((root / "runs").exists())


class GateTests(unittest.TestCase):
    def test_production_sources_bind_manifest_and_actual_checkout_bytes(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "builder.scala"
            source.write_text("pinned source fixture")
            path = root / "production-baseline-source.json"
            path.write_text(json.dumps({"baseline_commit": execute.BASELINE, "sha256": {"builder.scala": replay.sha(source)}}))
            approval = {"production_source_manifest_sha256": replay.sha(path)}
            with mock.patch.object(replay, "request") as request, mock.patch.object(execute.subprocess, "run") as subprocess:
                self.assertEqual(execute.production_sources(approval, root, root)["verified_file_count"], 1)
                source.write_text("changed after rebase")
                with self.assertRaisesRegex(ValueError, "Hash mismatch"):
                    execute.production_sources(approval, root, root)
                source.write_text("pinned source fixture")
                path.write_text(path.read_text() + "\n")
                with self.assertRaisesRegex(ValueError, "Hash mismatch"):
                    execute.production_sources(approval, root, root)
                request.assert_not_called()
                subprocess.assert_not_called()

    def test_production_manifest_missing_empty_or_wrong_baseline_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            with self.assertRaisesRegex(ValueError, "requires"):
                execute.production_sources({}, root, root)
            path = root / "production-baseline-source.json"
            for manifest in ({"baseline_commit": "wrong", "sha256": {"x": "0" * 64}},
                             {"baseline_commit": execute.BASELINE, "sha256": {}}):
                path.write_text(json.dumps(manifest))
                with self.assertRaises(ValueError):
                    execute.production_sources({"production_source_manifest_sha256": replay.sha(path)}, root, root)

    def test_bound_artifacts_reject_escape_and_tampering(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            artifact = root / "unit.txt"
            artifact.write_text("offline fixture")
            digest = replay.sha(artifact)
            self.assertEqual(execute.bound_file(root, "unit.txt", digest), artifact.resolve())
            for name in (str(artifact.resolve()), "../unit.txt"):
                with self.assertRaises(ValueError):
                    execute.bound_file(root, name, digest)
            artifact.write_text("changed")
            with self.assertRaisesRegex(ValueError, "Hash mismatch"):
                execute.bound_file(root, "unit.txt", digest)

    def test_unapproved_or_stale_manifest_never_touches_engine(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            for name, value in (("spec-freeze.json", {}), ("validation.json", {}), ("approval.json", {})):
                (root / name).write_text(json.dumps(value))
            frozen = {"spec_sha256": {"generation-spec.json": "unused", "query-spec.jsonl": "unused"}}
            with mock.patch.object(execute.freeze_tool, "verify", return_value=frozen), \
                 mock.patch.object(replay, "request") as request, \
                 mock.patch.object(execute.subprocess, "run") as subprocess:
                with self.assertRaisesRegex(ValueError, "approval"):
                    execute.gate(root / "spec-freeze.json", root / "validation.json", root / "approval.json")
                request.assert_not_called()
                subprocess.assert_not_called()

    def test_freeze_verifier_is_authoritative_and_fail_closed(self):
        with mock.patch.object(execute.freeze_tool, "verify", side_effect=ValueError("Frozen specification changed")) as verify, \
             mock.patch.object(replay, "request") as request:
            with self.assertRaisesRegex(ValueError, "Frozen specification changed"):
                execute.gate("missing-freeze.json", "missing-validation.json", "missing-approval.json")
            verify.assert_called_once()
            request.assert_not_called()

    def test_expected_embedding_model_rejects_mismatch_before_cache(self):
        expected = "Alibaba-NLP/gte-base-en-v1.5"
        for response_model in (None, "another-model"):
            with self.subTest(response_model=response_model), tempfile.TemporaryDirectory() as temp:
                cache = pathlib.Path(temp)
                response = {"model": response_model, "data": [{"index": 0, "embedding": [.1, .2]}]}
                with mock.patch.object(replay, "request", return_value=response) as request:
                    with self.assertRaisesRegex(ValueError, "response model"):
                        replay.embed_texts("http://127.0.0.1:13000", ["unit"], cache, expected_model=expected)
                self.assertEqual(request.call_args.args[3]["model"], expected)
                self.assertEqual(list(cache.iterdir()), [])

    def test_expected_model_matching_vectors_and_legacy_default_unchanged(self):
        expected = "Alibaba-NLP/gte-base-en-v1.5"
        for model in (None, expected):
            with self.subTest(model=model), tempfile.TemporaryDirectory() as temp:
                cache = pathlib.Path(temp)
                response = {"model": expected, "data": [{"index": 0, "embedding": [.1, .2]}]}
                with mock.patch.object(replay, "request", return_value=response) as request:
                    self.assertEqual(replay.embed_texts("http://127.0.0.1:13000", ["unit"], cache, expected_model=model), [[.1, .2]])
                    self.assertEqual("model" in request.call_args.args[3], model is not None)
                with mock.patch.object(replay, "request") as request:
                    self.assertEqual(replay.embed_texts("http://127.0.0.1:13000", ["unit"], cache, expected_model=model), [[.1, .2]])
                    request.assert_not_called()

    def test_embedding_cache_requires_pinned_model_identity(self):
        for identity in (None, {"image_digest": "wrong-model"}):
            with self.subTest(identity=identity), tempfile.TemporaryDirectory() as temp:
                root = pathlib.Path(temp)
                cache = root / "cache"
                cache.mkdir()
                if identity is None:
                    (cache / "unidentified.json").write_text("[]")
                else:
                    (cache / "embedding-cache-identity.json").write_text(json.dumps(identity))
                args = SimpleNamespace(artifact_root=root / "artifacts", cache=cache)
                with mock.patch.object(replay, "prepare") as prepare, self.assertRaises(ValueError):
                    execute.prepare(args, {"generation": {"embedding": {"model": "Alibaba-NLP/gte-base-en-v1.5"}}})
                prepare.assert_not_called()

    def test_exporter_topk_uses_actual_cli_not_body_patching(self):
        paths = {name: pathlib.Path("/tmp/unit-" + name) for name in ("queries", "requests", "mapping", "config")}
        radial = execute.exporter_command(SimpleNamespace(sbt="sbt"), paths, "magda-relevance-eval-unit")
        topk = execute.exporter_command(SimpleNamespace(sbt="sbt"), paths, "magda-relevance-eval-unit", top_k=True)
        self.assertNotIn("--k 1", radial[-1])
        self.assertIn("--k 1", topk[-1])
        self.assertNotIn("--regions-endpoint", radial[-1])
        self.assertIn(execute.BASELINE, radial[-1])

    def test_controls_reuses_existing_checks_and_restores_module_globals(self):
        for fail in (False, True):
            with self.subTest(fail=fail), tempfile.TemporaryDirectory() as temp:
                fake = SimpleNamespace(SYSTEMS=replay.SYSTEMS,
                    FORMAT_SYSTEMS=tuple(s for s in replay.SYSTEMS if s not in ("keyword", "vector")))
                originals = fake.SYSTEMS, fake.FORMAT_SYSTEMS
                def verify(args):
                    self.assertEqual(set(fake.SYSTEMS), set(replay.SYSTEMS + replay.EXTRA_SYSTEMS))
                    self.assertIn("raw_boost1", fake.FORMAT_SYSTEMS)
                    names = (["inputs", "install"] + ["eligibility/" + s for s in fake.SYSTEMS]
                             + ["format/" + f + "/" + s for f in ("CSV", "missing") for s in fake.FORMAT_SYSTEMS]
                             + ["normalization_executes"])
                    self.assertEqual(len(names), 23)
                    self.assertTrue(args.allow_local_writes)
                    if fail:
                        raise RuntimeError("probe failed")
                    return {"controls": {name: {"status": "passed"} for name in names}}
                fake.verify = verify
                args = SimpleNamespace(allow_local_writes=True, output=str(pathlib.Path(temp) / "controls.json"),
                                       top_k=False, engine_url="http://127.0.0.1:19200")
                state = {"generation": {"systems": list(replay.SYSTEMS + replay.EXTRA_SYSTEMS)}}
                with mock.patch.object(execute, "module", return_value=fake), mock.patch.object(replay, "request") as request:
                    if fail:
                        with self.assertRaisesRegex(RuntimeError, "probe failed"):
                            execute.controls(args, state)
                    else:
                        report = execute.controls(args, state)
                        self.assertEqual(len(report["controls"]), 23)
                    request.assert_not_called()
                self.assertEqual((fake.SYSTEMS, fake.FORMAT_SYSTEMS), originals)

    def test_run_requires_complete_preparation_before_network(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            (root / "preparation.json").write_text(json.dumps({"all_embedding_jobs_complete": False}))
            with mock.patch.object(replay, "request") as request, self.assertRaisesRegex(ValueError, "Prepare all"):
                execute.run(SimpleNamespace(artifact_root=root), {"freeze_sha256": "f", "validation_sha256": "v"})
            request.assert_not_called()


class SupplementaryProbeTests(unittest.TestCase):
    def spec(self):
        return execute.document(ROOT / "quality-spatial-probe-spec.json")

    def responses(self, spec):
        out = {}
        for variant in spec["query_variants"]:
            maps = {}
            for system, base in (("baseline", 40), ("raw_boost1", 2), ("keyword", 3), ("vector", 1)):
                maps[system] = {}
                for place in spec["dataset_plan"]["geographies"]:
                    spatial = bool(variant["boost_regions"]) and place == "inside"
                    for i, quality in enumerate(spec["dataset_plan"]["qualities"]):
                        # Arbitrary positive matching score differs by geography;
                        # only the production multiplier is the test oracle.
                        maps[system]["probe-" + place + "-q" + str(i)] = base * (2 if spatial else 1) * (1 + quality + spatial)
            for system, weights in replay.WEIGHTS.items():
                maps[system] = {}
                for identifier in maps["keyword"]:
                    value = 0
                    for family, weight in zip(("keyword", "vector"), weights):
                        low, high = min(maps[family].values()), max(maps[family].values())
                        value += weight * max(.001, (maps[family][identifier] - low) / (high - low))
                    maps[system][identifier] = value
            out[variant["id"]] = {system: {"hits": {"total": {"value": 6, "relation": "eq"}, "hits": [{"_id": identifier, "_score": score} for identifier, score in values.items()]},
                "timed_out": False, "_shards": {"failed": 0}} for system, values in maps.items()}
        return out

    def test_fixed_probe_math_uses_production_sum_and_normalized_floor(self):
        spec = self.spec()
        checks = execute.probe_score_checks(spec, self.responses(spec))
        self.assertEqual(set(checks), {"quality-only", "quality-and-spatial"})
        self.assertEqual(checks["quality-only"]["normalized_fusion"]["candidate_03_07"]["probe-inside-q0"]["expected"], .001)

    def test_probe_math_rejects_wrong_multiplier_fusion_and_duplicates(self):
        spec = self.spec()
        for change in ("multiplier", "fusion", "duplicate"):
            with self.subTest(change=change):
                responses = self.responses(spec)
                if change == "multiplier":
                    responses["quality-and-spatial"]["baseline"]["hits"]["hits"][0]["_score"] += 3
                elif change == "fusion":
                    responses["quality-only"]["candidate_03_07"]["hits"]["hits"][0]["_score"] += .02
                else:
                    rows = responses["quality-only"]["baseline"]["hits"]["hits"]
                    rows[0]["_id"] = rows[1]["_id"]
                with self.assertRaises(ValueError):
                    execute.probe_score_checks(spec, responses)

    def test_probe_separate_approval_hash_required_before_any_effect(self):
        with tempfile.TemporaryDirectory() as temp:
            approval = pathlib.Path(temp) / "approval.json"
            approval.write_text("{}")
            args = SimpleNamespace(allow_local_writes=True, probe_spec=ROOT / "quality-spatial-probe-spec.json", approval=approval)
            with mock.patch.object(replay, "request") as request, mock.patch.object(execute.subprocess, "run") as subprocess:
                with self.assertRaisesRegex(ValueError, "own parent-approved"):
                    execute.quality_spatial_probe(args, {})
                request.assert_not_called()
                subprocess.assert_not_called()

    def test_exporter_region_fixture_override_is_owned_and_not_http(self):
        paths = {name: pathlib.Path("/tmp/unit-" + name) for name in ("queries", "requests", "mapping", "config")}
        command = execute.exporter_command(SimpleNamespace(sbt="sbt"), paths, "magda-relevance-eval-unit",
            dimension=3, regions_index="magda-relevance-eval-owned-regions")
        self.assertIn("--regions-index magda-relevance-eval-owned-regions", command[-1])
        self.assertNotIn("--regions-endpoint", command[-1])
        with self.assertRaises(ValueError):
            execute.exporter_command(SimpleNamespace(sbt="sbt"), paths, "magda-relevance-eval-unit", regions_index="regions27")

    def test_probe_full_mock_runs_all_eight_and_cleans_exact_resources(self):
        import shlex
        spec = self.spec()
        mocked_responses = self.responses(spec)
        for groups in mocked_responses.values():
            for response in groups.values():
                response["aggregations"] = {"Publisher-global": {"filter": {"doc_count": 6,
                    "terms-other-options": {"buckets": [{"key": "probe", "doc_count": 6}]}}}}
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            approval = root / "approval.json"
            approval.write_text(json.dumps({"supplementary_probe_spec_sha256": replay.sha(ROOT / "quality-spatial-probe-spec.json")}))
            args = SimpleNamespace(allow_local_writes=True, probe_spec=ROOT / "quality-spatial-probe-spec.json", approval=approval,
                output=root / "probe.json", sbt="sbt", engine_url="http://127.0.0.1:19200")
            state = {"generation": {"systems": spec["systems"]}, "freeze_sha256": "f", "validation_sha256": "v"}
            def export(command, **kwargs):
                parts = shlex.split(command[-1])[2:]
                options = dict(zip(parts[::2], parts[1::2]))
                rows = []
                for task in replay.load_jsonl(options["--input"]):
                    body = parent_tests.fixture()
                    root_query = body["query"]["function_score"]
                    root_query["score_mode"] = "sum"
                    root_query["functions"] = [{"weight": 1}, {"field_value_factor": {"field": "quality", "missing": 1},
                        "filter": {"term": {"hasQuality": {"value": True}}}}]
                    if task["boost_regions"]:
                        root_query["functions"].append({"weight": 1, "filter": {"geo_shape": {"spatial.geoJson": {
                            "indexed_shape": {"index": options["--regions-index"], "id": "ste/3903", "path": "geometry"},
                            "relation": "intersects"}}}})
                    rows.append({"query_id": task["id"], "boost_regions_index": options["--regions-index"], "request": {"body": body}})
                replay.write_jsonl(options["--output"], rows)
                pathlib.Path(options["--mapping-output"]).write_text("{}")
                pathlib.Path(options["--config-output"]).write_text("{}")
            deleted = []
            def request(_base, method, path, body=None, *extra):
                if method == "GET":
                    return {"version": {"number": "2.19.1"}}
                if method == "DELETE":
                    deleted.append(path)
                    return {"acknowledged": True}
                if "_bulk" in path:
                    return {"errors": False}
                if "/_search?" in path or path.endswith("/_search"):
                    qid = "quality-and-spatial" if parent_tests.named(body["query"], "indexed_shape") else "quality-only"
                    if "search_pipeline=" in path:
                        system = next(s for s in spec["systems"] if path.endswith("-" + s.replace("_", "-")))
                    else:
                        system = "vector" if parent_tests.named(body["query"], "knn") else "keyword"
                    return mocked_responses[qid][system]
                return {"acknowledged": True}
            with mock.patch.object(execute.subprocess, "run", side_effect=export), mock.patch.object(replay, "request", side_effect=request):
                report = execute.quality_spatial_probe(args, state)
            self.assertEqual(report["status"], "passed")
            self.assertEqual(len(report["responses"]), 16)
            self.assertEqual(len(report["resources"]), 8)
            self.assertTrue(all(r["cleanup"] == "deleted" for r in report["resources"]))
            self.assertEqual(set(deleted), {r["path"] for r in report["resources"]})
            self.assertTrue(all("magda-relevance-eval-quality-spatial-" in path for path in deleted))
            self.assertEqual(len(replay.load_jsonl(root / "probe-artifacts" / "executed-requests.jsonl")), 16)

    def test_probe_partial_install_cleanup_is_exact_and_failure_persisted(self):
        spec = self.spec()
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            approval = root / "approval.json"
            approval.write_text(json.dumps({"supplementary_probe_spec_sha256": replay.sha(ROOT / "quality-spatial-probe-spec.json")}))
            args = SimpleNamespace(allow_local_writes=True, probe_spec=ROOT / "quality-spatial-probe-spec.json", approval=approval,
                output=root / "probe.json", sbt="sbt", engine_url="http://127.0.0.1:19200")
            state = {"generation": {"systems": spec["systems"]}, "freeze_sha256": "f", "validation_sha256": "v"}
            def export(command, **kwargs):
                artifacts = root / "probe-artifacts"
                replay.write_jsonl(artifacts / "baseline.jsonl", [])
                for name in ("mapping.json", "config.json"):
                    (artifacts / name).write_text("{}")
            deleted = []
            def request(_base, method, path, body=None, *extra):
                if method == "GET":
                    return {"version": {"number": "2.19.1"}}
                if method == "DELETE":
                    deleted.append(path)
                    return {"acknowledged": True}
                if "/_doc/" in path:
                    raise RuntimeError("fixed mock region write failure")
                return {"acknowledged": True}
            with mock.patch.object(execute.subprocess, "run", side_effect=export), mock.patch.object(replay, "request", side_effect=request):
                with self.assertRaisesRegex(RuntimeError, "fixed mock"):
                    execute.quality_spatial_probe(args, state)
            report = execute.document(args.output)
            self.assertEqual(report["status"], "failed")
            self.assertEqual(len(report["resources"]), 1)
            self.assertEqual(report["resources"][0]["cleanup"], "deleted")
            self.assertEqual(deleted, [report["resources"][0]["path"]])
            self.assertTrue(deleted[0].startswith("/magda-relevance-eval-quality-spatial-"))
            self.assertNotIn("regions27", json.dumps(deleted))


class DiagnosticGateTests(unittest.TestCase):
    def label_fixture(self):
        # Tiny arithmetic-only unit fixture, not benchmark records or C evidence.
        generation = {"seeds": [1, 2], "record_plans": [{"id": "d1"}, {"id": "d2"}],
                      "intent_doc_grades": {"intent": {"d1": 3, "d2": 0}}}
        queries = [{"id": "q1", "intent_id": "intent"}, {"id": "q2", "intent_id": "intent"}]
        expected = [{"query_id": q, "dataset_id": d, "grade": g} for q in ("q1", "q2") for d, g in (("d1", 3), ("d2", 0))]
        validated = [dict(row, seed=seed, grade="U" if seed == 1 and row["dataset_id"] == "d2" else row["grade"])
                     for seed in (1, 2) for row in expected]
        mask = [{"seed": 1, "intent_id": "intent", "dataset_id": "d2", "reason": "Explicit unresolved unit-fixture interpretation"}]
        return generation, queries, expected, validated, mask

    def test_explicit_uncertainty_expands_to_every_paraphrase_and_preserves_known(self):
        coverage = execute.diagnostic_labels(*self.label_fixture())
        self.assertEqual(coverage, {"validated_query_document_pairs": 8, "known_query_document_pairs": 6,
                                   "unknown_query_document_pairs": 2, "uncertainty_units": 1})

    def test_diagnostic_labels_reject_unknown_coercion_and_unexplained_mismatches(self):
        for kind in ("coerce", "known_mismatch", "unmasked_u", "missing_pair", "duplicate", "missing_mask", "empty_reason", "changed_expected", "boolean_grade"):
            with self.subTest(kind=kind):
                generation, queries, expected, validated, mask = self.label_fixture()
                if kind == "coerce":
                    validated[1]["grade"] = 0
                elif kind == "known_mismatch":
                    validated[0]["grade"] = 2
                elif kind == "unmasked_u":
                    validated[0]["grade"] = "U"
                elif kind == "missing_pair":
                    validated.pop()
                elif kind == "duplicate":
                    validated.append(copy.deepcopy(validated[0]))
                elif kind == "missing_mask":
                    mask.clear()
                elif kind == "empty_reason":
                    mask[0]["reason"] = " "
                elif kind == "changed_expected":
                    expected[0]["grade"] = 2
                else:
                    validated[-1]["grade"] = False
                with self.assertRaises(ValueError):
                    execute.diagnostic_labels(generation, queries, expected, validated, mask)

    def test_strict_gate_still_rejects_incomplete_diagnostic_document(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            freeze, validation, approval = (root / name for name in ("freeze.json", "validation.json", "approval.json"))
            freeze.write_text("{}")
            validation.write_text(json.dumps({"status": "incomplete_diagnostic_only", "independent_validation": True, "pre_retrieval": True}))
            approval.write_text(json.dumps({"execution_allowed": True, "approved_by": "parent-agent",
                "spec_freeze_sha256": replay.sha(freeze), "validation_manifest_sha256": replay.sha(validation)}))
            with mock.patch.object(execute.freeze_tool, "verify", return_value={"spec_sha256": {}}), \
                 mock.patch.object(execute, "production_sources", return_value={}), \
                 mock.patch.object(execute, "artifact_state") as artifacts, mock.patch.object(replay, "request") as request:
                with self.assertRaisesRegex(ValueError, "must pass"):
                    execute.gate(freeze, validation, approval)
                artifacts.assert_not_called()
                request.assert_not_called()

    def test_diagnostic_selection_requires_two_explicit_flags_and_never_fallback(self):
        for opted, policy in ((False, None), (True, None), (False, "policy.json"), (True, "policy.json")):
            with self.subTest(opted=opted, policy=policy), \
                 mock.patch.object(execute, "gate", return_value="strict") as strict, \
                 mock.patch.object(execute, "diagnostic_gate", return_value="diagnostic") as diagnostic:
                args = SimpleNamespace(freeze="f", validation="v", approval="a", diagnostic_policy=policy,
                                       allow_incomplete_diagnostic_replay=opted)
                if bool(opted) != bool(policy):
                    with self.assertRaises(ValueError):
                        execute.execution_gate(args)
                    strict.assert_not_called()
                    diagnostic.assert_not_called()
                else:
                    self.assertEqual(execute.execution_gate(args), "diagnostic" if opted else "strict")
                    self.assertEqual(diagnostic.called, opted)
                    self.assertEqual(strict.called, not opted)

    def diagnostic_documents(self, root):
        freeze, validation, approval, policy = (root / name for name in ("freeze.json", "validation.json", "approval.json", "policy.json"))
        freeze.write_text("{}")
        for name in ("quality-spatial-probe-spec.json", "mask.jsonl", "validated.jsonl", "expected.jsonl", "queries.jsonl"):
            (root / name).write_text("{}\n")
        doc = {"status": "incomplete_diagnostic_only", "independent_validation": True, "pre_retrieval": True,
            "full_validation_passed": False, "promotion_allowed": False, "forced_recommendation": "C",
            "manual_record_reviews": 540, "query_equivalence_reviews": 75, "known_qrels_match_frozen": True,
            "spec_freeze_sha256": replay.sha(freeze), "validated_qrels_path": "validated.jsonl",
            "validated_qrels_sha256": replay.sha(root / "validated.jsonl"), "uncertainty_mask_path": "mask.jsonl",
            "uncertainty_mask_sha256": replay.sha(root / "mask.jsonl")}
        p = {"mode": "supplementary_nonpromotional", "pre_retrieval": True, "no_outcomes_seen": True,
            "recommendation": "C", "promotion_allowed": False, "created_utc": "2026-11-06T00:00:00Z",
            "spec_freeze_sha256": replay.sha(freeze), "uncertainty_mask_sha256": doc["uncertainty_mask_sha256"]}
        a = {"execution_allowed": True, "approved_by": "parent-agent", "diagnostic_only": True, "promotion_allowed": False,
            "spec_freeze_sha256": replay.sha(freeze), "supplementary_probe_spec_sha256": replay.sha(root / "quality-spatial-probe-spec.json")}
        return (freeze, validation, approval, policy), doc, p, a

    def write_diagnostic_documents(self, paths, doc, policy, approval):
        _freeze, vp, ap, pp = paths
        vp.write_text(json.dumps(doc))
        policy["validation_manifest_sha256"] = replay.sha(vp)
        pp.write_text(json.dumps(policy))
        approval.update(diagnostic_validation_sha256=replay.sha(vp), diagnostic_policy_sha256=replay.sha(pp))
        ap.write_text(json.dumps(approval))

    def test_diagnostic_gate_hash_bound_mock_fixture_forces_c_before_any_effect(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            paths, doc, policy, approval = self.diagnostic_documents(root)
            self.write_diagnostic_documents(paths, doc, policy, approval)
            state = {"generation": {}, "queries": root / "queries.jsonl", "qrels": root / "expected.jsonl"}
            coverage = {"validated_query_document_pairs": 40500, "known_query_document_pairs": 40494,
                        "unknown_query_document_pairs": 6, "uncertainty_units": 2}
            with mock.patch.object(execute.freeze_tool, "verify", return_value={}), \
                 mock.patch.object(execute, "production_sources", return_value={}), \
                 mock.patch.object(execute, "artifact_state", return_value=state), \
                 mock.patch.object(execute, "diagnostic_labels", return_value=coverage), \
                 mock.patch.object(replay, "request") as request, mock.patch.object(execute.subprocess, "run") as subprocess:
                result = execute.diagnostic_gate(*paths)
                self.assertIs(result["diagnostic_metadata"]["promotion_allowed"], False)
                self.assertEqual(result["diagnostic_metadata"]["forced_recommendation"], "C")
                self.assertEqual(result["qrels"], (root / "validated.jsonl").resolve())
                request.assert_not_called()
                subprocess.assert_not_called()

    def test_diagnostic_gate_cannot_accept_promotion_partial_reviews_or_unbound_hashes(self):
        changes = (("approval", "promotion_allowed", True), ("approval", "diagnostic_only", False),
                   ("document", "full_validation_passed", True), ("document", "manual_record_reviews", 539),
                   ("document", "query_equivalence_reviews", 74), ("document", "known_qrels_match_frozen", False),
                   ("policy", "recommendation", "A"), ("policy", "no_outcomes_seen", False),
                   ("policy", "created_utc", "2026-11-06T00:00:00"), ("approval", "supplementary_probe_spec_sha256", "0" * 64))
        for target, field, value in changes:
            with self.subTest(target=target, field=field), tempfile.TemporaryDirectory() as temp:
                paths, doc, policy, approval = self.diagnostic_documents(pathlib.Path(temp))
                {"approval": approval, "document": doc, "policy": policy}[target][field] = value
                self.write_diagnostic_documents(paths, doc, policy, approval)
                with mock.patch.object(execute.freeze_tool, "verify", return_value={}), \
                     mock.patch.object(execute, "production_sources", return_value={}), \
                     mock.patch.object(execute, "artifact_state") as artifacts, mock.patch.object(replay, "request") as request:
                    with self.assertRaises(ValueError):
                        execute.diagnostic_gate(*paths)
                    artifacts.assert_not_called()
                    request.assert_not_called()

    def test_identity_receipt_cannot_silently_change_diagnostic_mode_or_mask(self):
        with tempfile.TemporaryDirectory() as temp:
            path = pathlib.Path(temp) / "identity.json"
            state = {"freeze_sha256": "f", "validation_sha256": "v", "approval_sha256": "a", "diagnostic_metadata": {
                "diagnostic_only": True, "promotion_allowed": False, "forced_recommendation": "C", "uncertainty_mask_sha256": "m"}}
            execute.identity_receipt(path, state)
            self.assertIs(execute.document(path)["promotion_allowed"], False)
            execute.identity_receipt(path, state)
            changed = copy.deepcopy(state)
            changed["diagnostic_metadata"]["uncertainty_mask_sha256"] = "changed"
            with self.assertRaises(ValueError):
                execute.identity_receipt(path, changed)
            changed.pop("diagnostic_metadata")
            with self.assertRaises(ValueError):
                execute.identity_receipt(path, changed)


if __name__ == "__main__":
    unittest.main()
