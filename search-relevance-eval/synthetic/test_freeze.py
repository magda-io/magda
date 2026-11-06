"""Contract-only fixtures: no searchable benchmark metadata is generated here."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
import shutil

from synthetic import freeze


def contract(root):
    plans = []
    for index in range(1, 181):
        suite = "A" if index <= 100 else "B"
        plans.append({"id": ("a" + str(index).zfill(3)) if suite == "A" else "b" + str(index - 100).zfill(3),
                      "suite": suite, "family": "cocoa" if index <= 20 else "confectionery" if index <= 70 else "beverage" if index <= 100 else "identifier",
                      "hard_negative_for_intent_ids": ["s" + str(n) for n in range(10)] if index in (90, 91) else []})
    ids = [r["id"] for r in plans]
    intents, queries, matrix = [], [], {}
    def add(intent, kind, count, anchor=None):
        intents.append({"intent_id": intent})
        matrix[intent] = {i: 3 if i == anchor else 0 for i in ids}
        for n in range(count):
            q = {"id": intent + "-" + str(n), "intent_id": intent, "kind": kind, "split": "development", "query": "contract placeholder", "success_criteria": "contract placeholder"}
            if kind == "exact":
                q.update(authoritative_target_ids=[anchor], near_identifier_ids=["b080"])
            queries.append(q)
    for i in range(10):
        add("s" + str(i), "semantic", 3, "a" + str(i + 1).zfill(3))
    for i in range(20):
        add("x" + str(i), "exact", 1, "b" + str(i + 1).zfill(3))
    for i in range(4):
        add("d" + str(i), "ambiguous", 1)
    add("negative", "no_answer", 1)
    generation = {"record_plans": plans, "seeds": [1, 2, 3], "intent_doc_grades": matrix}
    for name in freeze.SPEC_FILES:
        (root / name).write_text("contract placeholder\n")
    (root / "generation-spec.json").write_text(json.dumps(generation))
    (root / "query-spec.jsonl").write_text("".join(json.dumps(q) + "\n" for q in queries))
    (root / "intents.jsonl").write_text("".join(json.dumps(i) + "\n" for i in intents))
    return generation, queries


class FreezeTests(unittest.TestCase):
    def test_preregistration_is_immutable_and_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            contract(root)
            first = freeze.create(root)
            self.assertEqual(first, freeze.create(root))
            self.assertEqual(first, freeze.verify(root))
            self.assertEqual(len(first["design_summary"]["record_ids"]), 180)
            self.assertEqual(first["phase"], "before_dataset_generation_and_search")

    def test_post_freeze_query_change_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            contract(root)
            freeze.create(root)
            with (root / "query-spec.jsonl").open("a") as stream:
                stream.write("{}\n")
            with self.assertRaisesRegex(ValueError, "Frozen specification changed"):
                freeze.verify(root)

    def test_no_direct_semantic_anchor_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            g, _ = contract(root)
            g["intent_doc_grades"]["s0"]["a001"] = 0
            (root / "generation-spec.json").write_text(json.dumps(g))
            with self.assertRaisesRegex(ValueError, "lacks direct anchor"):
                freeze.create(root)

    def test_paraphrase_split_leakage_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, queries = contract(root)
            queries[0]["split"] = "heldout"
            (root / "query-spec.jsonl").write_text("".join(json.dumps(q) + "\n" for q in queries))
            with self.assertRaisesRegex(ValueError, "cross development"):
                freeze.inspect(root)

    def test_missing_or_colliding_exact_negatives_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, queries = contract(root)
            exact = next(q for q in queries if q["kind"] == "exact")
            exact["near_identifier_ids"] = exact["authoritative_target_ids"]
            (root / "query-spec.jsonl").write_text("".join(json.dumps(q) + "\n" for q in queries))
            with self.assertRaisesRegex(ValueError, "near-identifier negatives"):
                freeze.inspect(root)

    def amendment_fixture(self, root):
        generation, _ = contract(root)
        for plan in generation["record_plans"]:
            if plan["id"] in ("b029", "b030"):
                plan["identifier_requirements"] = {"forbidden_scope_if_title_only": ["description", "queryContext", "distributions"]}
        (root / "generation-spec.json").write_text(json.dumps(generation))
        original = freeze.create(root)
        archive = root / "registration-history/v1"
        archive.mkdir(parents=True)
        for name in list(freeze.SPEC_FILES) + ["spec-freeze.json"]:
            shutil.copyfile(root / name, archive / name)
        shutil.copyfile(freeze.__file__, archive / "freeze.py")
        for plan in generation["record_plans"]:
            if plan["id"] in ("b029", "b030"):
                req = plan["identifier_requirements"]
                req["forbidden_scope_if_title_only"].remove("queryContext")
                req["derived_query_context_policy"] = "Exact production Title+Description projection is mandatory and may repeat the title identifier; this is not an additional primary metadata scope."
        (root / "generation-spec.json").write_text(json.dumps(generation))
        amendment = root / "amendment.json"
        amendment.write_text(json.dumps({"independent_spec_review_passed": True, "queries_and_grades_unchanged": True}))
        return original, archive, amendment

    def test_explicit_title_context_revision_preserves_original(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            original, archive, amendment = self.amendment_fixture(root)
            revised = freeze.amend_title_context(root, archive, amendment)
            self.assertEqual(revised["registration_revision"], 2)
            self.assertEqual(revised["design_summary"], original["design_summary"])
            self.assertEqual(json.loads((archive / "spec-freeze.json").read_text()), original)
            self.assertEqual(freeze.verify(root), revised)
            amendment.write_text("{}")
            with self.assertRaisesRegex(ValueError, "amendment was altered"):
                freeze.verify(root)

    def test_revision_cannot_change_queries_or_matrix(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, archive, amendment = self.amendment_fixture(root)
            generation = json.loads((root / "generation-spec.json").read_text())
            generation["intent_doc_grades"]["s0"]["a001"] = 0
            (root / "generation-spec.json").write_text(json.dumps(generation))
            with self.assertRaisesRegex(ValueError, "exceeds the two approved"):
                freeze.amend_title_context(root, archive, amendment)

    def test_revision_cannot_follow_written_corpus(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            _, archive, amendment = self.amendment_fixture(root)
            corpus = root / ".local/corpora/seed-1.jsonl"
            corpus.parent.mkdir(parents=True)
            corpus.write_text("{}\\n")
            with self.assertRaisesRegex(ValueError, "precede all written benchmark"):
                freeze.amend_title_context(root, archive, amendment)

    def test_family_composition_and_seed_independence_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            g, _ = contract(root)
            original = copy.deepcopy(g)
            g["record_plans"][0]["family"] = "confectionery"
            (root / "generation-spec.json").write_text(json.dumps(g))
            with self.assertRaisesRegex(ValueError, "20/50/30"):
                freeze.inspect(root)
            original["seeds"] = [1, 1, 2]
            (root / "generation-spec.json").write_text(json.dumps(original))
            with self.assertRaisesRegex(ValueError, "distinct integer seeds"):
                freeze.inspect(root)


if __name__ == "__main__":
    unittest.main()
