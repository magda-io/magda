"""Offline generator self-checks; these are NOT independent relevance review."""
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent
from synthetic import generate, freeze


def copy_specification(root):
    for name in (*freeze.SPEC_FILES, 'spec-freeze.json', 'freeze.py'):
        shutil.copyfile(ROOT / name, root / name)
    frozen = json.loads((ROOT / 'spec-freeze.json').read_text())
    if frozen.get('registration_revision') == 2:
        amendment = frozen['amendment']['path']
        shutil.copyfile(ROOT / amendment, root / amendment)
        archive = frozen['supersedes']['archive']
        shutil.copytree(ROOT / archive, root / archive)


class GeneratorTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.design, cls.queries = generate.load_design()
        cls.corpora = {seed: generate.generate(seed) for seed in cls.design['seeds']}
        cls.plans = {p['id']: p for p in cls.design['record_plans']}

    def test_population_and_framework_fields(self):
        ids = [f'a{i:03}' for i in range(1, 101)] + [f'b{i:03}' for i in range(1, 81)]
        for seed, docs in self.corpora.items():
            self.assertEqual([d['identifier'] for d in docs], ids)
            self.assertEqual(len({d['title'] for d in docs}), 180)
            for d in docs:
                self.assertEqual(d['tenantId'], 0)
                self.assertEqual(d['publishingState'], 'published')
                self.assertEqual(d['quality'], 1)
                self.assertIs(d['hasQuality'], True)
                self.assertEqual(set(d['publisher']), {'identifier', 'name'})
                self.assertEqual(d['queryContext'], f"Title: {d['title']}\nDescription: {d['description']}\n")
                for child in d['distributions']:
                    self.assertEqual(child['queryContext'], f"Title: {child['title']}\nFormat: {child['format']}\nDescription: {child['description']}\n")
                    self.assertTrue(child['downloadURL'].startswith('https://synthetic.invalid/'))
                    self.assertEqual(child['publishingState'], 'published')
                    self.assertEqual(child['tenantId'], 0)
                    self.assertNotIn('queryContextVector', child)

    def test_qrels_are_exhaustive_mechanical_frozen_copy(self):
        rows = generate.expected_qrels()
        self.assertEqual(len(rows), 13500)
        pairs = {(r['query_id'], r['dataset_id']) for r in rows}
        self.assertEqual(len(pairs), 13500)
        intent_by_query = {q['id']: q['intent_id'] for q in self.queries}
        for row in rows:
            self.assertEqual(set(row), {'query_id', 'dataset_id', 'grade'})
            self.assertEqual(row['grade'], self.design['intent_doc_grades'][intent_by_query[row['query_id']]][row['dataset_id']])

    def test_deterministic_regeneration(self):
        for seed, docs in self.corpora.items():
            self.assertEqual(generate.jsonl_bytes(docs), generate.jsonl_bytes(generate.generate(seed)))
        with self.assertRaises(ValueError):
            generate.generate(123)

    def test_claim_columns_required_formats_and_omissions(self):
        for docs in self.corpora.values():
            for d in docs:
                p = self.plans[d['identifier']]
                text = '\n'.join(generate.searchable_strings(d))
                for fact in p['facts']:
                    self.assertIn(generate.COLUMNS[fact][0], text)
                for fact in p['constraints'].get('do_not_assert_facts', []):
                    self.assertNotIn(generate.COLUMNS[fact][0], text)
                self.assertEqual({c['format'] for c in d['distributions']}, set(p['distribution_requirements']['required_formats']))
                if p['constraints']['data_basis'] == 'simulation_only':
                    self.assertIn('All entries are computer simulations', d['description'])
                else:
                    self.assertNotIn('All entries are computer simulations', d['description'])

    def test_all_positive_literal_bans(self):
        import re
        intents = freeze.jsonl(ROOT / 'intents.jsonl')
        for docs in self.corpora.values():
            for intent in intents:
                for d in docs:
                    if self.design['intent_doc_grades'][intent['intent_id']][d['identifier']] < 2:
                        continue
                    text = '\n'.join(generate.searchable_strings(d))
                    for token in intent.get('absent_positive_tokens', []):
                        self.assertIsNone(re.search(r'(?i)(?<!\w)' + re.escape(token) + r'(?!\w)', text), (d['identifier'], token))

    def test_exact_identity_scope_and_aliases(self):
        for docs in self.corpora.values():
            byid = {d['identifier']: d for d in docs}
            for p in self.plans.values():
                req = p.get('identifier_requirements')
                if not req:
                    continue
                d = byid[p['id']]
                token = req['authoritative_identifier']
                if req.get('exact_title'):
                    self.assertEqual(d['title'], req['exact_title'])
                scope = req['identifier_scope']
                if scope == 'distribution_only':
                    self.assertTrue(any(token in c['title'] or token in c['description'] for c in d['distributions']))
                elif scope == 'title_only':
                    self.assertIn(token, d['title'])
                    self.assertIn(token, d['queryContext'])  # production-derived title copy
                else:
                    self.assertIn(token, d['description'])
                for alias in req['aliases']:
                    self.assertIn(alias, d['description'])
                if scope in ('distribution_only', 'title_only'):
                    for field in req['forbidden_scope_if_' + scope]:
                        self.assertNotIn(token, '\n'.join(generate.searchable_strings(d.get(field, ''))))
            self.assertIn('component only', byid['b005']['description'])
            self.assertIn('not the complete parent running shoe', byid['b011']['description'])

    def test_no_repeated_description_sentences(self):
        import re
        for docs in self.corpora.values():
            for d in docs:
                parts = re.split(r'(?<=[.!?])\s+(?=[A-Z])', d['description'])
                self.assertEqual(len(parts), len(set(parts)), d['identifier'])

    def test_no_answer_keys_in_indexed_shape(self):
        prohibited = {'intent_id', 'suite', 'facts', 'canonical_claims', 'design_role', 'grade',
                      'positive_anchor_intent_ids', 'hard_negative_for_intent_ids'}
        def check(value):
            if isinstance(value, dict):
                self.assertFalse(prohibited.intersection(value))
                for child in value.values():
                    check(child)
            elif isinstance(value, list):
                for child in value:
                    check(child)
        for docs in self.corpora.values():
            check(docs)

    def test_seed_variation_registered_thresholds(self):
        stats = generate.variation(self.corpora)
        self.assertGreaterEqual(stats['any_pair_length_difference_ge10'], 108)
        self.assertGreaterEqual(stats['any_pair_changed_distribution_count'], 54)
        for seed in self.design['seeds']:
            s = stats[str(seed)]
            self.assertGreaterEqual(s['publisher_count'], 12)
            for count in s['length_bands'].values():
                self.assertGreaterEqual(count, 36, s)
            self.assertGreaterEqual(sum(n for k, n in s['distribution_counts'].items() if k > 1), 54)
            self.assertGreaterEqual(s['description_words']['min'], 45)
            self.assertLessEqual(s['description_words']['max'], 220)
            self.assertGreaterEqual(s['title_words']['min'], 4)
            self.assertLessEqual(s['title_words']['max'], 12)

    def test_safe_idempotent_output_and_manifest(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / 'spec'
            root.mkdir()
            copy_specification(root)
            out = Path(tmp) / 'corpora'
            one = generate.run(out, root)
            two = generate.run(out, root, verify_existing=True)
            self.assertEqual(one, two)
            expected_ids = sorted(self.plans)
            expected_hash = hashlib.sha256(json.dumps(expected_ids, separators=(',', ':')).encode()).hexdigest()
            self.assertEqual(one['stable_ids_sha256'], expected_hash)
            self.assertEqual(one['qrel_count'], 13500)
            self.assertEqual(one['sample']['records'], 8)
            self.assertIn('independent C validation REQUIRED', one['label_status'])
            with self.assertRaises(FileExistsError):
                generate.run(out, root)
            target = out / 'seed-39031.jsonl'
            target.write_text('unrelated output\n')
            with self.assertRaises(FileExistsError):
                generate.run(out, root, verify_existing=True)
            self.assertEqual(target.read_text(), 'unrelated output\n')

    def test_freeze_change_fails_before_generation(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            copy_specification(root)
            with (root / 'intents.jsonl').open('a') as out:
                out.write('\n')
            with self.assertRaisesRegex(ValueError, 'Frozen specification changed'):
                generate.generate(39031, root)

    def test_v3_exact_patch_scope_and_503_unchanged_rows(self):
        proofs = []
        for seed in self.design['seeds']:
            base = [generate.make_record(p, seed) for p in self.design['record_plans']]
            actual_v2 = ROOT / f'.local/corpora-v2/seed-{seed}.jsonl'
            self.assertEqual(actual_v2.read_bytes(), generate.jsonl_bytes(base))
            proofs.extend(generate.apply_v3_patches(base, seed))
            actual_v3 = ROOT / f'.local/corpora-v3/seed-{seed}.jsonl'
            self.assertEqual(actual_v3.read_bytes(), generate.jsonl_bytes(base))
            generate.apply_v4_patches(base, seed)
            self.assertEqual(generate.jsonl_bytes(base), generate.jsonl_bytes(self.corpora[seed]))
        self.assertEqual(sum(p['row_bytes_identical'] for p in proofs), 503)
        self.assertEqual(sum(not p['row_bytes_identical'] for p in proofs), 37)
        self.assertEqual(len(generate.patch_contract()), 48)
        self.assertEqual(sum(len(p['field_changes']) for p in proofs), 92)
        for proof in proofs:
            if proof['row_bytes_identical']:
                self.assertEqual(proof['before_record_sha256'], proof['after_record_sha256'])
            else:
                self.assertNotEqual(proof['before_record_sha256'], proof['after_record_sha256'])
        for seed, docs in self.corpora.items():
            byid = {d['identifier']: d for d in docs}
            self.assertIn('warehouse bags of harvested cacao material from the crop', byid['a005']['description'])
            self.assertIn('outside confectionery production areas', byid['a057']['description'])
            self.assertIn('sealed cartons of liquid chocolate-flavoured dairy milk beverage', byid['a076']['description'])
            self.assertNotIn('physical samples', byid['a046']['description'])
            for identifier in ('a005', 'a076'):
                before = next(d for d in generate.freeze.jsonl(ROOT / f'.local/corpora-v2/seed-{seed}.jsonl') if d['identifier'] == identifier)
                import re
                for site in generate.SITES:
                    for sector in ('East', 'West', 'North', 'South', 'Upper', 'Lower', 'Central', 'Outer', 'Inner', 'Coastal'):
                        full_site = site + ' ' + sector
                        if full_site in before['description']:
                            self.assertIn(full_site, byid[identifier]['description'])
        bad = [generate.make_record(p, 39031) for p in self.design['record_plans']]
        bad[0]['title'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'base corpus hash differs'):
            generate.apply_v3_patches(bad, 39031)

    def test_v4_only_two_titles_and_538_unchanged_rows(self):
        proofs = []
        changed_from_v2 = set()
        for seed in self.design['seeds']:
            base = generate.freeze.jsonl(ROOT / f'.local/corpora-v3/seed-{seed}.jsonl')
            proofs.extend(generate.apply_v4_patches(base, seed))
            self.assertEqual(generate.jsonl_bytes(base), generate.jsonl_bytes(self.corpora[seed]))
            v2 = generate.freeze.jsonl(ROOT / f'.local/corpora-v2/seed-{seed}.jsonl')
            for before, after in zip(v2, base):
                if generate.encoded(before) != generate.encoded(after):
                    changed_from_v2.add((seed, after['identifier']))
        self.assertEqual(len(changed_from_v2), 37)
        self.assertEqual(sum(p['row_bytes_identical'] for p in proofs), 538)
        changed = [p for p in proofs if not p['row_bytes_identical']]
        self.assertEqual({(p['seed'], p['dataset_id']) for p in changed}, {(39032, 'a039'), (39032, 'a079')})
        for proof in changed:
            self.assertEqual({c['field'] for c in proof['field_changes']}, {'title', 'queryContext'})
        bad = generate.freeze.jsonl(ROOT / '.local/corpora-v3/seed-39032.jsonl')
        bad[0]['title'] += ' changed'
        with self.assertRaisesRegex(ValueError, 'base corpus/record hash differs'):
            generate.apply_v4_patches(bad, 39032)

    def test_immutable_rejects_symlinks(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'target'
            p.write_bytes(b'untouched')
            link = Path(tmp) / 'link'
            link.symlink_to(p)
            with self.assertRaises(ValueError):
                generate.immutable(link, b'changed', True)
            self.assertEqual(p.read_bytes(), b'untouched')


if __name__ == '__main__':
    unittest.main()
