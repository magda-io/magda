"""Offline only: mocked response geometry, not actual engine evidence."""
import copy
import importlib.util
import json
import pathlib
import tempfile
import types
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parent

def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    value = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(value)
    return value

boundary = module("boundary_offline_tests", ROOT / "cutoff_boundary.py")
helpers = module("boundary_response_test_helpers", ROOT / "test_correctness.py")


class BoundaryTests(unittest.TestCase):
    def test_fixed_float32_geometry_and_inclusive_half(self):
        grid = boundary.geometry()
        self.assertEqual(tuple(v["planned_native_score"] for v in grid), (.52, .5, .49, .47, .455, .445, .43, .41, .39))
        self.assertEqual(grid[1]["float32_vector"], [1, 0, 0])
        self.assertEqual(grid[1]["geometry_native_score"], .5)
        self.assertEqual([len(boundary.expected(c)) for c in boundary.contract.THRESHOLD_LABELS.values()], [2, 3, 4, 5, 6, 7, 8])
        self.assertIn("geometry-1", boundary.expected(.5))
        for role in ("root", "child"):
            docs = boundary.documents(role)
            self.assertEqual(len(docs), 9)
            for doc in docs:
                self.assertEqual(doc["title"], "marmalade")
                self.assertEqual(doc["description"], "")
                self.assertEqual("queryContextVector" in doc, role == "root")
                self.assertEqual(len(doc["distributions"]), int(role == "child"))

    def execute(self, directory, corrupt=None, continue_cells=False):
        folder = pathlib.Path(directory)
        mock_inputs = helpers.CorrectnessTests().setup_args(folder)
        exports = folder / "unit-fixture-exports"
        for label in boundary.contract.THRESHOLD_LABELS:
            arm = exports / label
            arm.mkdir(parents=True)
            rows = boundary.replay.load_jsonl(mock_inputs.requests[label])
            for row in rows:
                row["request"]["body"]["size"] = 10  # Unit fixture only: actual operational smoke exports use10.
            (arm / "requests.jsonl").write_text("".join(json.dumps(row) + "\n" for row in rows))
            (arm / "config.json").write_text(pathlib.Path(mock_inputs.configs[label]).read_text())
            (arm / "mapping.json").write_text(pathlib.Path(mock_inputs.mapping).read_text())
        args = types.SimpleNamespace(engine_url="http://127.0.0.1:19200", exports=str(exports),
            output=str(folder / "boundary.json"), allow_local_writes=True,
            continue_cells=continue_cells, native_calibration=continue_cells)
        calls = []
        prior = {"engine": {"cluster_uuid": "unit-mock-not-real", "version": {"number": "2.19.1"}}}
        def request(base, method, path, body=None, content_type=None):
            calls.append((method, path, copy.deepcopy(body)))
            if method == "GET":
                return copy.deepcopy(prior["engine"])
            if method in ("PUT", "DELETE"):
                boundary.owned(path[1:])
                return {"acknowledged": not (corrupt == "cleanup" and method == "DELETE")}
            if "_bulk" in path:
                return {"errors": False, "items": [{"index": {"status": 201}} for _ in range(9)]}
            self.assertTrue(path.endswith("/_search?search_pipeline=_none"))
            role = "root" if "-boundary-root/" in path else "child"
            if '"script_score"' in json.dumps(body):
                ids = {item["identifier"] for item in boundary.geometry()}
                result = helpers.response(boundary.documents(role), ids, lambda _: set())
                scoremap = {item["identifier"]: item["geometry_native_score"] for item in boundary.geometry()}
                for hit in result["hits"]["hits"]:
                    hit["_score"] = scoremap[hit["_id"]]
                return result
            cutoff = boundary.contract.knn_copies(body)[0][2]["min_score"]
            ids = boundary.expected(cutoff)
            if corrupt == "equality" and cutoff == .5:
                ids.remove("geometry-1")
            if corrupt == "admission":
                ids.add("geometry-8")  # Boost cannot admit native score .39 at cutoff .50.
            response = helpers.response(boundary.documents(role), ids,
                lambda identifier: {identifier + "-distribution"} if role == "child" else set())
            return response
        original_read = pathlib.Path.read_text
        original_sha = boundary.replay.sha
        def read_text(path, *a, **kw):
            if str(path).endswith(".local/correctness-runtime-provenance.json"):
                return json.dumps(prior)
            return original_read(path, *a, **kw)
        def sha(path):
            if str(path).endswith(".local/correctness-runtime-provenance.json"):
                return "0" * 64  # Explicit synthetic provenance receipt, never engine evidence.
            return original_sha(path)
        with mock.patch.object(boundary.replay, "request", side_effect=request), \
             mock.patch.object(pathlib.Path, "read_text", read_text), \
             mock.patch.object(boundary.replay, "sha", side_effect=sha):
            if corrupt:
                with self.assertRaises(AssertionError):
                    boundary.run(args)
                report = json.loads(pathlib.Path(args.output).read_text())
            else:
                report = boundary.run(args)
        return report, calls

    def test_fourteen_raw_checks_and_exact_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            report, calls = self.execute(directory)
        self.assertEqual(report["status"], "passed")
        self.assertEqual(len(report["responses"]), 14)
        self.assertTrue(report["cleanup_all_acknowledged"])
        self.assertEqual(sum(method == "DELETE" for method, _, _ in calls), 2)
        self.assertFalse(any("/pipeline/" in path for _, path, _ in calls))
        for receipt in report["requests"]:
            self.assertEqual(receipt["size"], 10)
            for _, field, payload in boundary.contract.knn_copies(receipt["body"]):
                self.assertEqual(payload["vector"], [0, 0, 0])
                self.assertEqual(payload.get("boost"), 50 if field == boundary.contract.ROOT_FIELD else None)
                self.assertNotIn("k", payload)
        self.assertNotIn("queryContextVector", json.dumps(report["responses"]))

    def test_diagnostic_continues_all_cells_without_turning_failure_green(self):
        with tempfile.TemporaryDirectory() as directory:
            report, calls = self.execute(directory, "equality", continue_cells=True)
        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["interior_admission_status"], "passed")
        self.assertEqual(len(report["errors"]), 2)
        self.assertEqual(len(report["responses"]), 14)
        self.assertEqual(sum("/_search?" in path for _, path, _ in calls), 16)
        self.assertTrue(report["cleanup_all_acknowledged"])
        self.assertTrue(all(r["exact_half_script_score_equals_half"] for r in report["native_calibration"].values()))
        self.assertTrue(all(report["controls"]["ms_050"][r]["status"] == "failed" for r in ("root", "child")))

    def test_bad_admission_or_cleanup_keeps_failed_report(self):
        for corrupt in ("admission", "cleanup"):
            with self.subTest(corrupt=corrupt), tempfile.TemporaryDirectory() as directory:
                report, _ = self.execute(directory, corrupt)
                self.assertEqual(report["status"], "failed")
                self.assertTrue(report["error"])
                self.assertEqual(report["cleanup_all_acknowledged"], corrupt != "cleanup")
                if corrupt == "admission":
                    self.assertEqual(report["controls"]["ms_050"]["root"]["status"], "failed")
                    self.assertEqual(report["controls"]["ms_048"]["root"]["status"], "not_run")


if __name__ == "__main__":
    unittest.main()
