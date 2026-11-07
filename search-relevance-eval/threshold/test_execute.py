"""Offline synthetic/mocked execution integration tests; never load study corpora."""
import copy
import importlib.util
import json
from pathlib import Path
from types import SimpleNamespace
import tempfile
import unittest
from unittest import mock

SOURCE = Path(__file__).with_name("execute.py")
spec = importlib.util.spec_from_file_location("threshold_execution_tests", SOURCE)
ex = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ex)
spec = importlib.util.spec_from_file_location("threshold_execution_diag_tests", SOURCE.with_name("diagnostics.py"))
diag = importlib.util.module_from_spec(spec)
spec.loader.exec_module(diag)


class ExecutionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name).resolve()
        self.root = self.repo / "search-relevance-eval/threshold"
        self.root.mkdir(parents=True)
        self.addCleanup(mock.patch.stopall)
        mock.patch.object(ex, "ROOT", self.root).start()
        mock.patch.object(ex, "REPO", self.repo).start()
        mock.patch.object(ex.freeze, "verify", return_value={}).start()
        self.http = mock.patch.object(ex.replay, "request", side_effect=AssertionError("No live requests in unit tests")).start()
        self.diag_http = mock.patch.object(diag.replay, "request", side_effect=AssertionError("No live diagnostic requests")).start()
        self.embedding = {"model": "frozen-alias", "dimension": 2,
                          "image": "example/pinned:1", "image_digest": "sha256:" + "a" * 64,
                          "inference": "fixed-unit-test"}
        self.artifacts = self.root / ".local/unit-execution"
        self.artifacts.mkdir(parents=True)

    def put(self, path, value):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))
        return path

    def jsonl(self, path, rows):
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("".join(json.dumps(row) + "\n" for row in rows))
        return path

    def relative(self, path):
        return str(Path(path).relative_to(self.repo))

    def fixture(self):
        """Construct approval-shaped FAKE files only inside the temporary repo."""
        for name in ("execute.py", "diagnostics.py", "freeze.py", "export_contract.py", "spec-freeze.json"):
            self.put(self.root / name, {"test_only": name})
        self.put(self.root.parent / "run.py", {"test_only": True})
        self.put(self.root.parent / "scala/ExportBaselineRequests.scala", {"test_only": True})
        self.put(self.root.parent / "synthetic/generation-spec.json", {"embedding": self.embedding})
        production = {}
        for number in range(8):
            path = self.put(self.repo / ("production-%d.json" % number), {"test_only": number})
            production[self.relative(path)] = ex.replay.sha(path)
        self.put(self.root.parent / "synthetic/production-baseline-source.json",
                 {"baseline_commit": ex.freeze.BASELINE, "sha256": production})
        control = self.put(self.root / "fake-controls.json", {"status": "passed", "production_pipeline_parity": {"status": "passed"}})
        runtime = self.put(self.root / "fake-runtime.json", {"image_digest": self.embedding["image_digest"]})
        corpus = self.jsonl(self.root / "fake-corpus.jsonl", [{"identifier": "test-doc", "title": "Unit fixture"}])
        queries = self.jsonl(self.root / "fake-queries.jsonl", [{"id": "test-q", "query": "Unit fixture", "split": "development"}])
        cases = [{"cohort": "NEW", "seed": seed, "catalog_size": size}
                 for seed in (38871, 38872, 38873) for size in (60, 1000, 2000)]
        cases += [{"cohort": "LEGACY", "seed": seed, "catalog_size": 180} for seed in (39031, 39032, 39033)]
        cases += [{"cohort": "REAL", "seed": 3902, "catalog_size": 1}]
        for number, case in enumerate(cases):
            case.update(index="magda-relevance-eval-unit-%d" % number,
                        corpus=self.relative(corpus), queries=self.relative(queries))
        # Metadata-only independent closure mocks; these are not actual validations.
        for case in cases:
            if case["cohort"] == "REAL":
                case.update(reuse_embedded_corpus=self.relative(corpus), reuse_embedded_queries=self.relative(queries),
                    reuse_embedding={**{key: self.embedding[key] for key in ("model", "image_digest", "dimension")},
                        "corpus_sha256": ex.replay.sha(corpus), "queries_sha256": ex.replay.sha(queries),
                        "provenance": [self.relative(runtime)]})
        fake_evidence = self.jsonl(self.root / "fake-evidence.jsonl", [{"test_only": True}])
        evidence_ref = {"path": fake_evidence.name, "sha256": ex.replay.sha(fake_evidence)}
        new_validation = self.put(self.root / "fake-new-validation.json", {
            **{key: True for key in ("all_expanded_rows_independently_reconstructed", "all_known_pairs_inspected",
               "complete_actual_label_evidence", "pre_retrieval", "diagnostic_only", "original_strict_conformance_failed")},
            "forced_recommendation": "D", "promotion_allowed": False, "actual_text_validation_passed": False,
            "spec_freeze_sha256": ex.replay.sha(self.root / "spec-freeze.json"),
            "qrels": evidence_ref, "expanded_evidence": evidence_ref,
            "corpora": [{"seed": c["seed"], "dataset_count": c["catalog_size"], "path": corpus.name,
                         "sha256": ex.replay.sha(corpus)} for c in cases if c["cohort"] == "NEW"]})
        old_validation = self.put(self.root / "fake-legacy-validation.json", {"independent_validation": True,
            "known_qrels_match_frozen": True, "pre_retrieval": True, "promotion_allowed": False,
            "unknown_pair_count": 12, "query_spec_sha256": ex.replay.sha(queries),
            "corpora": [{"seed": c["seed"], "dataset_count": c["catalog_size"], "path": corpus.name,
                         "sha256": ex.replay.sha(corpus)} for c in cases if c["cohort"] == "LEGACY"]})
        bundle = self.put(self.root / "fake-real-bundle.json", {"members": [
            {"name": name, "sha256": ex.replay.sha(path)} for name, path in
            (("corpus.jsonl", corpus), ("queries.jsonl", queries),
             ("embedded-corpus.jsonl", corpus), ("embedded-queries.jsonl", queries))]})
        paths = list(self.repo.rglob("*"))  # Test-owned temporary tree only.
        inputs = {"pre_retrieval": True, "thresholds": ex.freeze.THRESHOLDS,
                  "fixture_conformance_passed": False, "original_strict_conformance_failed": True,
                  "independent_actual_label_evidence_complete": True, "cases": cases,
                  "correctness_report": self.relative(control),
                  "new_validation_manifest": self.relative(new_validation),
                  "legacy_validation_manifest": self.relative(old_validation),
                  "real_bundle_manifest": self.relative(bundle),
                  "embedding_runtime_provenance": [self.relative(runtime)],
                  "source_sha256": {self.relative(path): ex.replay.sha(path) for path in paths if path.is_file()}}
        inputs_path = self.put(self.root / "fake-inputs.json", inputs)
        approval = {"approved_by": "parent-agent", "execution_allowed": True,
                    "spec_freeze_sha256": ex.replay.sha(self.root / "spec-freeze.json"),
                    "inputs_sha256": ex.replay.sha(inputs_path), "diagnostic_only": True,
                    "forced_recommendation": "D", "promotion_allowed": False}
        approval_path = self.put(self.root / "fake-approval.json", approval)
        return inputs, approval, inputs_path, approval_path

    def regate(self, inputs, approval, inputs_path, approval_path):
        self.put(inputs_path, inputs)
        approval["inputs_sha256"] = ex.replay.sha(inputs_path)
        self.put(approval_path, approval)
        return ex.gate(approval_path, inputs_path)

    def test_gate_hashes_full_13_cases_without_http(self):
        inputs, approval, ip, ap = self.fixture()
        checked = ex.gate(ap, ip)
        self.assertEqual(len(checked["inputs"]["cases"]), 13)
        self.assertEqual(checked["production_files_verified"], 8)
        self.http.assert_not_called()

    def test_gate_rejects_missing_code_control_and_runtime_closure(self):
        inputs, approval, ip, ap = self.fixture()
        for name in (self.relative(self.root / "execute.py"), inputs["correctness_report"],
                     inputs["embedding_runtime_provenance"][0]):
            bad = copy.deepcopy(inputs)
            del bad["source_sha256"][name]
            with self.subTest(name=name), self.assertRaises(ValueError):
                self.regate(bad, approval, ip, ap)
        self.http.assert_not_called()

    def test_gate_rejects_mutation_missing_cases_and_duplicate_indices(self):
        inputs, approval, ip, ap = self.fixture()
        bad = copy.deepcopy(inputs)
        bad["cases"].pop()
        with self.assertRaises(ValueError):
            self.regate(bad, approval, ip, ap)
        bad = copy.deepcopy(inputs)
        bad["cases"][1]["index"] = bad["cases"][0]["index"]
        with self.assertRaises(ValueError):
            self.regate(bad, approval, ip, ap)
        self.put(self.root / "execute.py", {"mutated": True})
        with self.assertRaises(ValueError):
            self.regate(inputs, approval, ip, ap)

    def test_independent_metadata_closure_rejects_wrong_corpus_query_or_real_member(self):
        inputs, approval, ip, ap = self.fixture()
        for field, mutate in (
            ("new_validation_manifest", lambda value: value["corpora"][0].update(sha256="0" * 64)),
            ("legacy_validation_manifest", lambda value: value.update(query_spec_sha256="0" * 64)),
            ("real_bundle_manifest", lambda value: value["members"][0].update(sha256="0" * 64)),
        ):
            path = ex.repo_file(inputs[field])
            original = ex.read_json(path)
            changed = copy.deepcopy(original)
            mutate(changed)
            self.put(path, changed)
            inputs["source_sha256"][inputs[field]] = ex.replay.sha(path)
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.regate(inputs, approval, ip, ap)
            self.put(path, original)
            inputs["source_sha256"][inputs[field]] = ex.replay.sha(path)

    def test_failed_conformance_cannot_become_promotional_execution(self):
        inputs, approval, ip, ap = self.fixture()
        for key, value in (("diagnostic_only", False), ("promotion_allowed", True), ("forced_recommendation", "A")):
            bad = dict(approval, **{key: value})
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.regate(inputs, bad, ip, ap)
        bad = dict(inputs, independent_actual_label_evidence_complete=False)
        with self.assertRaises(ValueError):
            self.regate(bad, approval, ip, ap)

    def reusable(self):
        source = {"identifier": "test-doc", "title": "Unit", "quality": 1, "tenantId": 0,
                  "publishingState": "published", "publisher": {"name": "Unit publisher"},
                  "distributions": [{"identifier": "test-child", "title": "Unit child", "format": "CSV"}]}
        reused = ex.corpus_projection(source)
        for item in [reused] + reused["distributions"]:
            item["queryContextVector"] = [1., 0.]
        query = {"id": "test-q", "query": "Unit", "split": "development", "filters": {"format": ["CSV"]}}
        return [source], [reused], [query], [dict(copy.deepcopy(query), vector=[1., 0.])]

    def test_reuse_checks_every_root_child_metadata_and_query_filter(self):
        rows = self.reusable()
        ex.verify_reused(*rows, count=1, dimension=2)
        for mutate in (
            lambda r: r[1][0].update(quality=2),
            lambda r: r[1][0].update(tenantId=9),
            lambda r: r[1][0]["publisher"].update(name="Changed"),
            lambda r: r[1][0]["distributions"][0].update(format="JSON"),
            lambda r: r[1][0]["distributions"][0].update(title="Different"),
            lambda r: r[3][0].update(split="heldout"),
            lambda r: r[3][0]["filters"].update(format=["JSON"]),
            lambda r: r[1][0].update(queryContextVector=[True, 0.]),
            lambda r: r[1][0]["distributions"][0].update(queryContextVector=[1.]),
        ):
            bad = copy.deepcopy(rows)
            mutate(bad)
            with self.assertRaises(ValueError):
                ex.verify_reused(*bad, count=1, dimension=2)

    def test_reuse_rejects_duplicate_root_and_query_ids(self):
        source, reused, queries, embedded = self.reusable()
        with self.assertRaises(ValueError):
            ex.verify_reused(source * 2, reused * 2, queries, embedded, 2, 2)
        with self.assertRaises(ValueError):
            ex.verify_reused(source, reused, queries * 2, embedded * 2, 1, 2)

    def test_reuse_requires_model_image_hash_attestation(self):
        inputs, approval, ip, ap = self.fixture()
        case = inputs["cases"][0]
        source, reused, queries, embedded = self.reusable()
        docs = self.jsonl(self.root / "fake-reused-corpus.jsonl", reused)
        tasks = self.jsonl(self.root / "fake-reused-queries.jsonl", embedded)
        case.update(reuse_embedded_corpus=self.relative(docs), reuse_embedded_queries=self.relative(tasks))
        for path in (docs, tasks):
            inputs["source_sha256"][self.relative(path)] = ex.replay.sha(path)
        attestation = {key: self.embedding[key] for key in ("model", "image_digest", "dimension")}
        attestation.update(corpus_sha256=ex.replay.sha(docs), queries_sha256=ex.replay.sha(tasks),
                           provenance=inputs["embedding_runtime_provenance"])
        case["reuse_embedding"] = attestation
        ex.verify_reuse_attestation(case, inputs, self.embedding)
        for key in ("model", "image_digest", "corpus_sha256", "queries_sha256", "provenance"):
            bad = copy.deepcopy(case)
            bad["reuse_embedding"][key] = [] if key == "provenance" else "wrong"
            with self.subTest(key=key), self.assertRaises(ValueError):
                ex.verify_reuse_attestation(bad, inputs, self.embedding)

    def test_prepare_uses_frozen_alias_and_model_image_scoped_cache(self):
        inputs, approval, ip, ap = self.fixture()
        source, reused, queries, embedded = self.reusable()
        case = dict(inputs["cases"][0], catalog_size=1)
        self.jsonl(ex.repo_file(case["corpus"]), source)
        self.jsonl(ex.repo_file(case["queries"]), queries)
        for key in ("corpus", "queries"):
            inputs["source_sha256"][case[key]] = ex.replay.sha(ex.repo_file(case[key]))
        inputs["cases"] = [case]  # Helper test, not an execution approval/gate.
        checked = {"inputs": inputs, "inputs_sha256": "unit-input-hash"}
        def prepare(args):
            self.assertEqual(args.expected_model, "frozen-alias")
            self.assertEqual(args.cache.name, ex.digest(self.embedding))
            self.jsonl(args.output_corpus, reused)
            self.jsonl(args.output_queries, embedded)
        with mock.patch.object(ex.replay, "prepare", side_effect=prepare) as service:
            ex.prepare(SimpleNamespace(artifact_root=self.artifacts, embedding_url="http://127.0.0.1:13000"), checked)
        self.assertEqual(service.call_count, 1)
        receipt = ex.read_json(self.artifacts / "preparation.json")
        self.assertEqual(receipt["embedding"], self.embedding)
        self.assertTrue(receipt["cases"][0]["source_projection_verified"])
        ex.verify_preparation(self.artifacts, checked)
        target = ex.case_dir(self.artifacts, case) / "embedded-corpus.jsonl"
        target.write_text("{}\n")
        with self.assertRaises(ValueError):
            ex.verify_preparation(self.artifacts, checked)
        self.http.assert_not_called()

    def test_sbt_arguments_reject_whitespace_and_command_injection(self):
        self.assertEqual(ex.safe_sbt_argument("/tmp/safe-path/requests.jsonl"), "/tmp/safe-path/requests.jsonl")
        for value in ("space path", "a;evil", "a\nnext", 'a"b', "$(evil)", "a\\b", "a\tb"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                ex.safe_sbt_argument(value)

    def test_split_selection_preserves_legacy_kinds_and_filters(self):
        queries = [{"id": "dev", "split": "development"}, {"id": "held", "split": "heldout"},
                   {"id": "diag", "split": "diagnostic"}]
        self.assertEqual(ex.selected_ids(queries, {"cohort": "NEW"}, "development"), {"dev"})
        self.assertEqual(ex.selected_ids(queries, {"cohort": "NEW"}, "heldout"), {"held", "diag"})
        legacy = [{"id": "old", "kind": "lookup", "filters": {"format": ["CSV"]}}]
        self.assertEqual(ex.selected_ids(legacy, {"cohort": "LEGACY"}, "development"), set())
        self.assertEqual(ex.selected_ids(legacy, {"cohort": "LEGACY"}, "heldout"), {"old"})
        with self.assertRaises(ValueError):
            ex.selected_ids(legacy, {"cohort": "NEW"}, "development")

    def test_heldout_requires_explicit_input_bound_forced_d_none_record(self):
        checked = {"inputs_sha256": "unit-input", "approval": {"diagnostic_only": True}}
        path = self.put(self.root / "fake-dev-decision.json", {"immutable_before_heldout": True,
            "created_utc": "2020-01-01T00:00:00+00:00", "inputs_sha256": "unit-input",
            "selected_threshold": "NONE", "promotion_allowed": False, "forced_recommendation": "D"})
        original = ex.read_json(path)
        ex.development_decision(path, checked)
        for patch in ({"inputs_sha256": "wrong"}, {"selected_threshold": .45}, {"promotion_allowed": True},
                      {"created_utc": "2020-01-01T00:00:00"}):
            self.put(path, dict(original, **patch))
            with self.assertRaises(ValueError):
                ex.development_decision(path, checked)
        del original["selected_threshold"]
        self.put(path, original)
        with self.assertRaises(ValueError):
            ex.development_decision(path, checked)

    def test_install_all_cases_before_any_replay_with_count_mapping_vector_receipts(self):
        cases = [{"cohort": cohort, "seed": number, "catalog_size": 1,
                  "index": "magda-relevance-eval-unit-%d" % number}
                 for number, cohort in enumerate(("NEW", "LEGACY", "REAL"))]
        mapping = {"mappings": {"properties": {"queryContextVector": {"type": "knn_vector", "dimension": 2}}}}
        for case in cases:
            target = ex.case_dir(self.artifacts, case)
            self.put(target / "exports/ms_050/mapping.json", mapping)
            self.jsonl(target / "embedded-corpus.jsonl", [{"identifier": "unit", "queryContextVector": [1., 0.]}])
        self.put(self.artifacts / "export-completion.json", {"test_only": True})
        checked = {"inputs": {"cases": cases}, "inputs_sha256": "unit"}
        args = SimpleNamespace(artifact_root=self.artifacts, engine_url="http://127.0.0.1:19200", allow_local_writes=True)
        events = []
        def metadata(engine, case):
            events.append(("metadata", case["index"]))
            return {"count": 1, "mapping_sha256": ex.digest(mapping["mappings"]), "index_uuid": case["index"]}
        with mock.patch.object(ex, "verify_exports"), mock.patch.object(ex, "index_metadata", side_effect=metadata), \
                mock.patch.object(ex.replay, "install", side_effect=lambda a: events.append(("install", a.index))), \
                mock.patch.object(ex.replay, "run_export_sets", side_effect=AssertionError("No timings during install")):
            ex.install(args, checked)
        self.assertEqual([kind for kind, _ in events], ["install", "metadata"] * 3)
        receipt = ex.read_json(self.artifacts / "installation.json")
        self.assertEqual(len(receipt["cases"]), 3)
        self.assertTrue(receipt["all_cases_installed_before_timings"])
        self.assertTrue(all(row["source_vectors_sha256"] for row in receipt["cases"]))
        with self.assertRaises(ValueError), mock.patch.object(ex, "verify_exports"):
            ex.install(args, checked)

    def test_run_never_installs_and_rejects_missing_install_before_retrieval(self):
        control = self.put(self.root / "fake-controls.json", {"status": "passed", "production_pipeline_parity": {"status": "passed"}})
        checked = {"inputs": {"correctness_report": self.relative(control),
            "source_sha256": {self.relative(control): ex.replay.sha(control)}}, "inputs_sha256": "unit", "approval": {}}
        args = SimpleNamespace(artifact_root=self.artifacts, engine_url="http://127.0.0.1:19200",
                               allow_local_writes=True, split="development")
        with mock.patch.object(ex, "verify_exports"), mock.patch.object(ex.replay, "install") as installer, \
                self.assertRaises(FileNotFoundError):
            ex.run(args, checked)
        installer.assert_not_called()
        self.http.assert_not_called()

    def test_export_closure_covers_all_9_arms_3_files_each_and_detects_mutation(self):
        case = {"cohort": "NEW", "seed": 1, "catalog_size": 1}
        checked = {"inputs": {"cases": [case]}, "inputs_sha256": "unit"}
        self.put(self.artifacts / "preparation.json", {"test_only": True})
        paths = ex.export_files(self.artifacts, [case])
        self.assertEqual(len(paths), 27)
        for path in paths:
            self.put(path, {"test_only": path.name})
        receipt = {"inputs_sha256": "unit", "preparation_sha256": ex.replay.sha(self.artifacts / "preparation.json"),
                   "files_sha256": {self.relative(path): ex.replay.sha(path) for path in paths}}
        self.put(self.artifacts / "export-completion.json", receipt)
        with mock.patch.object(ex, "verify_preparation"):
            ex.verify_exports(self.artifacts, checked)
            paths[-1].write_text("changed")
            with self.assertRaises(ValueError):
                ex.verify_exports(self.artifacts, checked)

    def role_fixture(self):
        # Existing 3-D production smoke fixture, never study queries/vectors.
        row = diag.replay.load_jsonl(SOURCE.parent.parent / "scala/smoke/baseline.jsonl")[0]
        # Test-owned copy: normalize its provenance label to current contract pin.
        row["baseline_commit"] = diag.contract.BASELINE
        baseline = self.jsonl(self.root / "fake-role-source.jsonl", [row])
        config = self.put(self.root / "fake-role-config.json", {"config_sha": row["config_sha"],
            "elasticSearch": {"indices": {"datasets": {"hybridSearch": {"minScore": .50, "k": None, "maxDistance": None}}}}})
        sets = {label: [diag.mixed_export(row, *pair)] for label, pair in diag.ROLE_PAIRS.items()}
        return row, baseline, config, sets

    def test_role_validator_only_accepts_exact_counterfactual_leaves_and_source_config(self):
        row, baseline, config, sets = self.role_fixture()
        validate = diag.role_validator(baseline, config)
        configs = {label: config for label in sets}
        proof = validate(sets, configs)
        self.assertFalse(proof["mixed_rows_are_actual_Scala_exports"])
        self.assertTrue(proof["config_is_original_uniform_050_not_mixed"])
        self.assertEqual(len(proof["request_sets"]), 2)
        for mutate in (
            lambda bad: bad[next(iter(bad))][0].update(config_sha="wrong"),
            lambda bad: bad[next(iter(bad))][0]["request"]["body"].update(size=9),
            lambda bad: bad[next(iter(bad))][0].update(diagnostic_mode="pretend_actual_export"),
            lambda bad: bad[next(iter(bad))].append(copy.deepcopy(bad[next(iter(bad))][0])),
        ):
            bad = copy.deepcopy(sets)
            mutate(bad)
            with self.assertRaises(ValueError):
                validate(bad, configs)
        with self.assertRaises(ValueError):
            diag.contract.validate_request_sets(sets, configs)
        self.put(config, {"changed": True})
        with self.assertRaises(ValueError):
            validate(sets, configs)

    def test_private_role_registry_reuses_existing_10rep_receipts_without_primary_mutation(self):
        row, baseline, config, sets = self.role_fixture()
        primary = tuple(ex.replay.EXPORTED_VARIANTS)
        diag_primary = tuple(diag.replay.EXPORTED_VARIANTS)
        runner = diag.role_runner()
        self.assertIsNot(runner, ex.replay)
        self.assertEqual(tuple(runner.EXPORTED_VARIANTS), tuple(diag.ROLE_PAIRS))
        paths = {label: self.jsonl(self.root / (label + ".jsonl"), rows) for label, rows in sets.items()}
        output, ledger = self.artifacts / "roles-runs.jsonl", self.artifacts / "roles-receipts.jsonl"
        response = {"timed_out": False, "_shards": {"failed": 0}, "took": 1,
                    "hits": {"total": {"value": 1, "relation": "eq"}, "hits": [{"_id": "unit", "_score": 1.}]}}
        def request(engine, method, path, body):
            self.assertEqual(method, "POST")
            self.assertIn("search_pipeline=_none", path)
            self.assertIn(body, [rows[0]["request"]["body"] for rows in sets.values()])
            return response
        args = SimpleNamespace(engine_url="http://127.0.0.1:19200", index="magda-relevance-eval-unit",
            output=output, raw_output=ledger, depth=row["request"]["body"]["size"], repetitions=10,
            raw_production_only=True, compact_output=True, seed=1)
        with mock.patch.object(runner, "request", side_effect=request) as requests, \
                mock.patch.object(runner, "experimental", side_effect=AssertionError("No alternate ranking framework")):
            rows = runner.run_export_sets(args, paths, config_paths={label: config for label in paths},
                                         validate_request_sets=diag.role_validator(baseline, config))
        self.assertEqual(requests.call_count, 22)  #2 excluded warmups +2x10 measured.
        self.assertEqual(tuple(ex.replay.EXPORTED_VARIANTS), primary)
        self.assertEqual(tuple(diag.replay.EXPORTED_VARIANTS), diag_primary)
        self.assertEqual(len(primary), 8)
        sealed = ex.case_run_receipt(self.artifacts, "roles", {"cohort": "NEW", "seed": 1, "catalog_size": 1},
                                    {row["query_id"]}, tuple(paths), rows)
        self.assertEqual(sealed["warmup_requests"], 2)
        self.assertEqual(sealed["measured_requests"], 20)
        provenance = runner.load_jsonl(str(output) + ".requests.jsonl")
        self.assertTrue(provenance[0]["validation"]["diagnostic_only"])
        self.assertTrue(all(item["export"]["diagnostic_mode"] == "mixed_role_threshold"
                            for item in provenance if item["kind"] == "exported_request"))

    def test_role_stage_requires_separate_approval_before_any_work(self):
        args = SimpleNamespace(allow_local_writes=True, artifact_root=self.artifacts, development_record=None)
        checked = {"approval": {}, "inputs": {}}
        with mock.patch.object(ex.diagnostics, "role_runner") as runner, self.assertRaises(ValueError):
            ex.role_run(args, checked)
        runner.assert_not_called()
        self.http.assert_not_called()


class GeometryOfflineTests(unittest.TestCase):
    def setUp(self):
        self.http = mock.patch.object(diag.replay, "request", side_effect=AssertionError("No live diagnostic request")).start()
        self.addCleanup(mock.patch.stopall)

    def response(self, hits):
        return {"timed_out": False, "_shards": {"failed": 0}, "hits": {"total": {"value": len(hits), "relation": "eq"}, "hits": hits}}

    def test_nested_geometry_requires_parent_and_child_eligibility(self):
        body = diag.native_request([1., 0.], 10, nested=True,
            eligible_parent_filter={"term": {"publisher.name.keyword": "Unit"}},
            eligible_child_filter={"term": {"distributions.format.keyword": "CSV"}})
        outer = body["query"]["bool"]
        self.assertIn({"term": {"tenantId": 0}}, outer["filter"])
        self.assertIn({"term": {"publishingState": "published"}}, outer["filter"])
        nested = outer["must"][0]["nested"]
        filters = nested["query"]["script_score"]["query"]["bool"]["filter"]
        self.assertIn({"term": {"distributions.tenantId": 0}}, filters)
        self.assertIn({"term": {"distributions.format.keyword": "CSV"}}, filters)
        self.assertEqual(nested["query"]["script_score"]["script"]["source"], "knn_score")
        for window in (True, 0, 101):
            with self.assertRaises(ValueError):
                diag.native_request([1., 0.], 10, nested=True, child_window=window)

    def test_collector_tracks_exact_totals_and_reports_primary_hnsw_window_misses(self):
        request = {"body": {"size": 10, "query": {"match_all": {}}}, "query_params": {"search_pipeline": "production"}}
        response = self.response([{"_id": "a", "_score": 1.}])
        with mock.patch.object(diag.replay, "request", return_value=response) as service:
            result = diag.fetch_exhaustive("http://127.0.0.1:19200", "magda-relevance-eval-unit", request, 10,
                                            primary_ids=["a", "not-retrieved"])
        self.assertTrue(service.call_args.args[3]["track_total_hits"])
        self.assertFalse(result["primary_top10_subset"])
        self.assertEqual(result["primary_ids_missing_from_collector"], ["not-retrieved"])
        self.assertIn("not_exact_HNSW_oracle", result["method"])
        self.assertIn("request_started_utc", result["receipt"])
        self.assertIn("request_completed_utc", result["receipt"])
        self.assertIn("all_hit_signatures", result["receipt"])
        self.assertIn("parsed_json_sha256", result["receipt"])

    def test_nested_native_rejects_foreign_parent_and_truncated_children(self):
        child = {"_id": "parent", "_score": 1., "_nested": {"field": "distributions", "offset": 0}}
        parent = {"_id": "parent", "_score": 1., "inner_hits": {"native_child_geometry": self.response([child])}}
        response = self.response([parent])
        with mock.patch.object(diag.replay, "request", return_value=response):
            result = diag.fetch_native("http://127.0.0.1:19200", "magda-relevance-eval-unit", [1., 0.], 10, nested=True)
        self.assertEqual(result["scores"]["parent"]["children"][0]["offset"], 0)
        child["_id"] = "foreign"
        with mock.patch.object(diag.replay, "request", return_value=response), self.assertRaises(ValueError):
            diag.fetch_native("http://127.0.0.1:19200", "magda-relevance-eval-unit", [1., 0.], 10, nested=True)
        child["_id"] = "parent"
        parent["inner_hits"]["native_child_geometry"]["hits"]["total"]["value"] = 2
        with mock.patch.object(diag.replay, "request", return_value=response), self.assertRaises(ValueError):
            diag.fetch_native("http://127.0.0.1:19200", "magda-relevance-eval-unit", [1., 0.], 10, nested=True)


if __name__ == "__main__":
    unittest.main()
