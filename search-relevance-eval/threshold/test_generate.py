"""Offline structural tests; these do NOT validate synthetic relevance labels."""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

HERE = Path(__file__).resolve().parent
S = importlib.util.spec_from_file_location("threshold_generator_under_test", HERE / "generate.py")
g = importlib.util.module_from_spec(S)
S.loader.exec_module(g)


class StageOneTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        g.freeze.verify(HERE)
        cls.spec = json.loads((HERE / "generation-spec.json").read_text())
        cls.core, cls.growth, cls.terminals = g.realize(cls.spec)

    def test_exact_population_no_expansion(self):
        for seed in g.SEEDS:
            self.assertEqual([r["identifier"] for r in self.core[seed]], [f"t{i:03}" for i in range(1, 61)])
            self.assertEqual([r["identifier"] for r in self.growth[seed]], [f"g{i:02}-r001" for i in range(1, 21)])
        self.assertEqual(len(self.terminals["bundles"]), 60)
        self.assertNotIn("stage_two", vars(g))

    def test_deterministic_independent_streams(self):
        core, growth, terminals = g.realize(self.spec)
        self.assertEqual(g.artifact_bytes(core, growth, terminals), g.artifact_bytes(self.core, self.growth, self.terminals))
        for i in range(60):
            self.assertEqual(len({self.core[s][i]["description"] for s in g.SEEDS}), 3)
        for i in range(20):
            self.assertEqual(len({self.growth[s][i]["description"] for s in g.SEEDS}), 3)
        a = [g.rng(38871, "t001").random(), g.rng(38871, "t002").random()]
        self.assertNotEqual(*a)
        self.assertEqual(g.rng(38871, "t001").random(), a[0])

    def test_exact_full_bundle_reconstruction(self):
        for b in self.terminals["bundles"]:
            doc = g.render_representative(b)
            i = int(b["archetype_id"][1:]) - 1
            self.assertEqual(g.canonical(doc), g.canonical(self.growth[b["seed"]][i]))
            self.assertFalse(g.slot_bindings(doc))
            self.assertEqual(b["slot_bindings"], g.slot_bindings(b["metadata"]))

    def test_closed_slot_positions(self):
        b = copy.deepcopy(self.terminals["bundles"][0])
        b["metadata"]["title"] += " {{station}}"
        b["slot_bindings"] = g.slot_bindings(b["metadata"])
        with self.assertRaisesRegex(ValueError, "unsafe"):
            g.render_representative(b)
        b = copy.deepcopy(self.terminals["bundles"][0])
        b["slot_bindings"] = []
        with self.assertRaisesRegex(ValueError, "bindings"):
            g.render_representative(b)
        b = copy.deepcopy(self.terminals["bundles"][0])
        b["metadata"]["description"] += " {{new_prose}}"
        b["slot_bindings"] = g.slot_bindings(b["metadata"])
        with self.assertRaisesRegex(ValueError, "unsafe"):
            g.render_representative(b)

    def test_slot_domains_and_publication_only(self):
        self.assertEqual(g.slot_values("g10", 1), {"record_id": "g10-r001", "station": "Station 001", "year": "2010", "month": "1"})
        self.assertEqual(g.slot_values("g12", 97), {"record_id": "g12-r097", "station": "Station 097", "year": "2010", "month": "1"})
        for invalid in (0, 98):
            with self.assertRaises(ValueError):
                g.slot_values("g10", invalid)
        for b in self.terminals["bundles"]:
            self.assertIn("Metadata release: {{year}}, month {{month}}.", b["metadata"]["description"])
            self.assertEqual(b["metadata"]["description"].count("{{station}}"), 1)

    def test_neutral_types_projections_urls(self):
        for seed in g.SEEDS:
            for doc in self.core[seed] + self.growth[seed]:
                self.assertEqual(doc["quality"], 1.0)
                self.assertIs(doc["hasQuality"], True)
                self.assertEqual(doc["tenantId"], 0)
                self.assertEqual(doc["publishingState"], "published")
                self.assertEqual(doc["publisher"].keys(), {"name"})
                self.assertEqual(doc["keywords"], [])
                self.assertTrue(doc["landingPage"].startswith("https://reserved.invalid/"))
                self.assertEqual(doc["queryContext"], f"Title: {doc['title']}\nDescription: {doc['description']}\n")
                for field in ("accessControl", "spatial", "temporal", "queryContextVector", "grade", "archetype", "claim_set", "role"):
                    self.assertNotIn(field, doc)
                for child in doc["distributions"]:
                    self.assertEqual(child["tenantId"], 0)
                    self.assertEqual(child["publishingState"], "published")
                    self.assertEqual(child["queryContext"], f"Title: {child['title']}\nFormat: {child['format']}\nDescription: {child['description']}\n")
                    self.assertTrue(child["downloadURL"].startswith("https://reserved.invalid/"))
                    for field in ("quality", "hasQuality", "accessControl", "queryContextVector"):
                        self.assertNotIn(field, child)

    def test_identity_scope_all_seeds(self):
        for seed in g.SEEDS:
            for plan, doc in zip(self.spec["core_record_plans"][48:], self.core[seed][48:]):
                c = self.spec["canonical_claim_sets"][plan["claim_set"]]
                if c["required_exact_title"] is not None:
                    self.assertEqual(doc["title"], c["required_exact_title"])
                if c["identity_scope"].startswith("distribution_only"):
                    self.assertNotIn(c["identity"], doc["queryContext"])
                    self.assertIn(c["identity"], doc["distributions"][0]["queryContext"])
                if c["identity_scope"] == "title_only_primary_fields":
                    remainder = {k: v for k, v in doc.items() if k not in ("title", "queryContext")}
                    self.assertNotIn(c["identity"], json.dumps(remainder))
                    self.assertIn(c["identity"], doc["queryContext"])
            self.assertNotEqual(self.core[seed][48]["title"], self.core[seed][49]["title"])
            self.assertIn("26O", self.core[seed][49]["title"])
            self.assertIn("41O", self.core[seed][55]["distributions"][0]["title"])

    def test_budgets_and_absence_checked(self):
        # All records pass in setUpClass. Intentionally violate two structural rules.
        plan = self.spec["core_record_plans"][0]
        claim = self.spec["canonical_claim_sets"][plan["claim_set"]]
        doc = copy.deepcopy(self.core[38871][0])
        doc["publisher"]["name"] = "escaping"
        with self.assertRaisesRegex(ValueError, "Forbidden positive token"):
            g.check_metadata(doc, plan, claim, self.spec)
        doc = copy.deepcopy(self.core[38871][0])
        doc["quality"] = 0.5
        with self.assertRaisesRegex(ValueError, "Non-neutral"):
            g.check_metadata(doc, plan, claim, self.spec)

    def test_exclusive_create_and_hash_closure(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "stage-one"
            first = g.stage_one(out)
            before = {p.name: p.read_bytes() for p in out.iterdir()}
            again = g.stage_one(out)
            self.assertEqual(first, again)
            self.assertEqual(before, {p.name: p.read_bytes() for p in out.iterdir()})
            self.assertEqual(first["stage"], "stage_one")
            self.assertFalse(first["actual_text_validation_passed"])
            self.assertEqual(first["raw_record_sha256"]["38871"]["t001"], g.digest(g.canonical(self.core[38871][0]) + b"\n"))
            self.assertEqual(first["canonical_record_sha256"]["38871"]["t001"], g.digest(g.canonical(self.core[38871][0])))
            self.assertNotEqual(first["raw_record_sha256"], first["canonical_record_sha256"])
            row = out / "core-38871.jsonl"
            row.write_bytes(row.read_bytes() + b" ")
            changed = row.read_bytes()
            with self.assertRaisesRegex(ValueError, "mismatch"):
                g.stage_one(out)
            self.assertEqual(row.read_bytes(), changed)
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "No existing"):
                g.stage_one(Path(tmp), True)
            sentinel = Path(tmp) / "rejected-first-realization"
            sentinel.write_text("retain")
            with self.assertRaisesRegex(ValueError, "Nonempty"):
                g.stage_one(Path(tmp))
            self.assertEqual(sentinel.read_text(), "retain")


if __name__ == "__main__":
    unittest.main()
