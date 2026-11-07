"""Offline guard/literal-render tests. Never expands the real 940/1940 growth set.

Renderer boundary tests use a tiny synthetic metadata bundle; retained actual
terminals are rendered at r001 ONLY to check already-existing representatives.
Output mechanics use mocked tiny payloads in temporary directories, not a real
study approval, backend, actual expanded catalog or newly validated qrels.
"""
import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location('threshold_expansion_under_test', HERE / 'expand.py')
e = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(e)


def toy_bundle():
    description = ('This synthetic test collection records an administrative register of named objects. '
                   'The contents are fictional examples for checking file structure and do not describe a scientific study. '
                   'Filed by {{station}}. Metadata release: {{year}}, month {{month}}.')
    file_description = ('This test file represents the register described at dataset level. Its contents are fictional '
                        'examples used solely to test serialization and do not add observations, measurements or independent evidence.')
    children = []
    for index, fmt in enumerate(('CSV', 'JSON'), 1):
        child = {'identifier': '{{record_id}}-d' + str(index), 'tenantId': 0, 'title': 'Test collection file',
                 'description': file_description, 'format': fmt, 'publishingState': 'published',
                 'downloadURL': 'https://reserved.invalid/collections/{{record_id}}/file-' + str(index) + '.' + fmt.lower()}
        child['queryContext'] = e.projection(child, True)
        children.append(child)
    doc = {'catalog': None, 'identifier': '{{record_id}}', 'title': 'Synthetic register', 'description': description,
           'publisher': {'name': 'Fictional Test Office, {{station}}'}, 'tenantId': 0, 'quality': 1.0,
           'hasQuality': True, 'publishingState': 'published', 'keywords': [], 'distributions': children,
           'landingPage': 'https://reserved.invalid/collections/{{record_id}}'}
    doc['queryContext'] = e.projection(doc)
    return {'seed': 38871, 'archetype_id': 'g01', 'claim_set': 'synthetic-test-not-truth', 'metadata': doc,
            'slot_bindings': [{'json_pointer': p, 'slot': s} for p, s in e.placeholder_bindings(doc)]}


def parent_approval(validation_sha):
    return {'schema_version': 1, 'approved_by': 'parent-agent', 'expansion_allowed': True,
            'diagnostic_only': True, 'promotion_allowed': False, 'forced_recommendation': 'D',
            'spec_freeze_sha256': e.FREEZE_SHA, 'stage_manifest_sha256': e.SOURCE_STAGE_SHA,
            'terminal_templates_sha256': e.TERMINALS_SHA,
            'independent_diagnostic_validation_path': 'test-independent-validation.json',
            'independent_diagnostic_validation_sha256': validation_sha,
            'approved_code_sha256': e.fsha(HERE / 'expand.py')}


def independent_validation():
    return {'schema_version': 1, 'status': 'audited_nonconformant_diagnostic_only',
            'diagnostic_only': True, 'promotion_allowed': False, 'forced_recommendation': 'D',
            'spec_freeze_sha256': e.FREEZE_SHA, 'stage_manifest_sha256': e.SOURCE_STAGE_SHA,
            'terminal_templates_sha256': e.TERMINALS_SHA, 'complete_actual_label_evidence': True,
            'manual_actual_record_count': 240, 'reviewed_terminal_bundle_count': 60,
            'all_known_pairs_inspected': True, 'unresolved_pairs_explicitly_U': True,
            'terminal_substitution_only_expansion_allowed': True}


def toy_source_closure(repository):
    root = repository / 'search-relevance-eval/threshold'
    root.mkdir(parents=True)
    runner = repository / 'search-relevance-eval/run.py'
    old = b'def context(doc, distribution=False):\n    return doc.get("title")\n'
    runner.write_bytes(old + b'\n# receipt logging only\n')
    archive = root / '.local/source-archive/run-at-first-realization.py'
    archive.parent.mkdir(parents=True)
    archive.write_bytes(old)
    other = root / 'unchanged-source.py'
    other.write_text('UNCHANGED = True\n')
    stage = {'source_sha256': {'search-relevance-eval/run.py': e.sha(old),
                              'search-relevance-eval/threshold/unchanged-source.py': e.fsha(other)}}
    proof = {'schema_version': 1, 'original_source': 'search-relevance-eval/run.py',
             'original_source_sha256': e.sha(old), 'archive_sha256': e.sha(old),
             'archived_source_path': '.local/source-archive/run-at-first-realization.py',
             'current_runtime_sha256': e.fsha(runner), 'context_function_ast_byte_representation_identical': True,
             'corpus_bytes_unchanged': True, 'queries_labels_unchanged': True, 'stage_manifest_unchanged': True}
    proof_path = root / 'generation-source-closure.json'
    proof_path.write_bytes(e.pretty(proof))
    approval = {'generation_source_closure_sha256': e.fsha(proof_path)}
    return root, stage, approval, runner, archive, other, proof


class ExpansionCodeTests(unittest.TestCase):
    def test_historical_runner_resolution_narrow_and_ast_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            root, stage, approval, runner, archive, other, proof = toy_source_closure(Path(tmp).resolve())
            # Any import/exec would raise; AST comparison must stay inspection only.
            runner.write_bytes(archive.read_bytes() + b'\nraise RuntimeError("never execute this module")\n')
            proof['current_runtime_sha256'] = e.fsha(runner)
            (root / 'generation-source-closure.json').write_bytes(e.pretty(proof))
            approval['generation_source_closure_sha256'] = e.fsha(root / 'generation-source-closure.json')
            result = e.resolve_generation_sources(root, stage, approval)
            self.assertEqual(set(result['historical_resolutions']), {'search-relevance-eval/run.py'})
            self.assertTrue(result['historical_resolutions']['search-relevance-eval/run.py']['context_ast_identical'])
            self.assertEqual(result['root_relative_input_sha256'][proof['archived_source_path']], e.fsha(archive))
            self.assertEqual(result['current_repository_source_sha256']['search-relevance-eval/run.py'], e.fsha(runner))

    def test_historical_source_closure_adversarial_rejections(self):
        for mutation in ('missing-proof', 'missing-parent-binding', 'wrong-proof-hash', 'altered-archive',
                         'changed-context-with-updated-runtime-hash', 'unknown-source-drift', 'false-ast-flag',
                         'wrong-old-hash', 'runtime-hash-drift', 'alternate-archive', 'duplicate-context'):
            with self.subTest(mutation=mutation), tempfile.TemporaryDirectory() as tmp:
                root, stage, approval, runner, archive, other, proof = toy_source_closure(Path(tmp).resolve())
                proof_path = root / 'generation-source-closure.json'
                if mutation == 'missing-proof':
                    # Leave approval pointing to a missing path using a separate root.
                    empty = root / 'empty-threshold'
                    empty.mkdir()
                    with self.assertRaisesRegex(ValueError, 'Missing generation source closure proof'):
                        e.resolve_generation_sources(empty, stage, approval)
                    continue
                if mutation == 'missing-parent-binding':
                    approval.clear()
                elif mutation == 'wrong-proof-hash':
                    approval['generation_source_closure_sha256'] = '0' * 64
                elif mutation == 'altered-archive':
                    archive.write_bytes(archive.read_bytes() + b'# changed\n')
                elif mutation == 'changed-context-with-updated-runtime-hash':
                    runner.write_text('def context(doc, distribution=False):\n    return "injected"\n')
                    proof['current_runtime_sha256'] = e.fsha(runner)
                elif mutation == 'unknown-source-drift':
                    other.write_text('UNREVIEWED = True\n')
                elif mutation == 'false-ast-flag':
                    proof['context_function_ast_byte_representation_identical'] = False
                elif mutation == 'wrong-old-hash':
                    proof['original_source_sha256'] = '0' * 64
                elif mutation == 'runtime-hash-drift':
                    runner.write_bytes(runner.read_bytes() + b'# current runtime changed\n')
                elif mutation == 'alternate-archive':
                    proof['archived_source_path'] = 'arbitrary-other-source.py'
                elif mutation == 'duplicate-context':
                    runner.write_bytes(runner.read_bytes() + b'\ndef context(doc):\n    return 0\n')
                    proof['current_runtime_sha256'] = e.fsha(runner)
                if mutation not in ('missing-parent-binding', 'wrong-proof-hash'):
                    proof_path.write_bytes(e.pretty(proof))
                    approval['generation_source_closure_sha256'] = e.fsha(proof_path)
                with self.assertRaises(ValueError):
                    e.resolve_generation_sources(root, stage, approval)
                self.assertFalse((root / '.local/expanded-v2').exists())

    def test_missing_parent_gate_before_any_materialization(self):
        with tempfile.TemporaryDirectory() as tmp, mock.patch.object(e, 'expanded_files') as materialize:
            root = Path(tmp).resolve()
            with self.assertRaisesRegex(ValueError, 'Missing explicit parent'):
                e.expand(root)
            materialize.assert_not_called()
            self.assertFalse((root / '.local/expanded-v2').exists())

    def test_every_parent_binding_fails_closed(self):
        changes = {'schema_version': 2, 'approved_by': 'generator-B', 'expansion_allowed': False,
                   'diagnostic_only': False, 'promotion_allowed': True, 'forced_recommendation': 'A',
                   'spec_freeze_sha256': '0' * 64, 'stage_manifest_sha256': '0' * 64,
                   'terminal_templates_sha256': '0' * 64, 'approved_code_sha256': '0' * 64}
        for field, wrong in changes.items():
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp).resolve()
                approval = parent_approval('0' * 64)
                approval[field] = wrong
                (root / 'parent-expansion-approval.json').write_bytes(e.pretty(approval))
                with mock.patch.object(e, 'expanded_files') as materialize:
                    with self.assertRaises(ValueError):
                        e.expand(root)
                    materialize.assert_not_called()
                self.assertFalse((root / '.local').exists())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            approval = parent_approval('0' * 64)
            approval['expansion_allowed'] = 'true'
            (root / 'parent-expansion-approval.json').write_bytes(e.pretty(approval))
            with self.assertRaisesRegex(ValueError, 'expansion_allowed'):
                e.validate_approval(root)

    def test_independent_validation_complete_evidence_not_status_only(self):
        required = ['status', 'complete_actual_label_evidence', 'manual_actual_record_count', 'reviewed_terminal_bundle_count',
                    'all_known_pairs_inspected', 'unresolved_pairs_explicitly_U',
                    'terminal_substitution_only_expansion_allowed', 'diagnostic_only', 'promotion_allowed',
                    'forced_recommendation', 'spec_freeze_sha256', 'stage_manifest_sha256', 'terminal_templates_sha256']
        for field in required:
            with self.subTest(field=field), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp).resolve()
                validation = independent_validation()
                validation.pop(field)
                data = e.pretty(validation)
                (root / 'test-independent-validation.json').write_bytes(data)
                (root / 'parent-expansion-approval.json').write_bytes(e.pretty(parent_approval(e.sha(data))))
                with self.assertRaisesRegex(ValueError, field):
                    e.validate_approval(root)
                self.assertFalse((root / '.local').exists())
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            (root / 'test-independent-validation.json').write_text('{}')
            (root / 'parent-expansion-approval.json').write_bytes(e.pretty(parent_approval('0' * 64)))
            with self.assertRaisesRegex(ValueError, 'Hash mismatch'):
                e.validate_approval(root)

    def test_path_and_json_no_ambiguity(self):
        with tempfile.TemporaryDirectory() as tmp:
            for path in ('../escape', '/absolute/path'):
                with self.assertRaises(ValueError):
                    e.inside(Path(tmp), path)
        with self.assertRaisesRegex(ValueError, 'Duplicate JSON'):
            e.parse('{"expansion_allowed":false,"expansion_allowed":true}')

    def test_toy_slots_boundary_values_only(self):
        bundle = toy_bundle()
        original = copy.deepcopy(bundle)
        for replica, year, month in ((1, '2010', '1'), (12, '2021', '12'), (16, '2025', '4'), (97, '2010', '1')):
            doc = e.render_terminal(bundle, replica)
            self.assertEqual(doc['identifier'], f'g01-r{replica:03}')
            self.assertIn(f'Station {replica:03}', doc['publisher']['name'])
            self.assertIn(f'Metadata release: {year}, month {month}.', doc['description'])
            self.assertEqual(doc['queryContext'], e.projection(doc))
            self.assertFalse(e.placeholder_bindings(doc))
            self.assertEqual([d['format'] for d in doc['distributions']], ['CSV', 'JSON'])
        self.assertEqual(bundle, original)
        for bad in (0, 98, True, '1'):
            with self.assertRaises(ValueError):
                e.render_terminal(bundle, bad)

    def test_no_slot_or_field_escape(self):
        for mutation in ('new-prose', 'title-station', 'missing-binding', 'extra-source', 'unpublished-child',
                         'child-quality', 'wrong-root-projection', 'third-format', 'malformed'):
            bundle = toy_bundle()
            doc = bundle['metadata']
            if mutation == 'new-prose':
                doc['description'] += ' {{free_prose}}'
            elif mutation == 'title-station':
                doc['title'] += ' {{station}}'
            elif mutation == 'extra-source':
                doc['unreviewed_field'] = 'new claim'
            elif mutation == 'unpublished-child':
                doc['distributions'][0]['publishingState'] = 'draft'
            elif mutation == 'child-quality':
                doc['distributions'][0]['quality'] = 1.0
            elif mutation == 'third-format':
                doc['distributions'].append(copy.deepcopy(doc['distributions'][0]))
            elif mutation == 'malformed':
                doc['description'] += ' {{FREE PROSE}}'
            if mutation != 'wrong-root-projection':
                doc['queryContext'] = e.projection(doc)
            else:
                doc['queryContext'] = 'injected terms'
            if mutation == 'missing-binding':
                bundle['slot_bindings'] = []
            elif mutation != 'malformed':
                bundle['slot_bindings'] = [{'json_pointer': p, 'slot': s} for p, s in e.placeholder_bindings(doc)]
            with self.subTest(mutation=mutation), self.assertRaises(ValueError):
                e.render_terminal(bundle, 1)

    def test_id_inventory_stable_subset_not_literal_prefix(self):
        sixty, thousand, two_thousand = (e.expected_ids(size) for size in e.SIZES)
        self.assertEqual([len(sixty), len(thousand), len(two_thousand)], [60, 1000, 2000])
        self.assertEqual(len(set(two_thousand)), 2000)
        self.assertEqual(thousand[:60], sixty)
        self.assertNotEqual(thousand, two_thousand[:1000])
        self.assertEqual([i for i in two_thousand if i in set(thousand)], thousand)
        # Token raw bytes are toy IDs only, never actual expansion metadata.
        raw = {identifier: identifier.encode() + b'\n' for identifier in two_thousand}
        small_lines = b''.join(raw[identifier] for identifier in thousand).splitlines(keepends=True)
        large_lines = b''.join(raw[identifier] for identifier in two_thousand).splitlines(keepends=True)
        shared = set(small_lines)
        self.assertEqual(small_lines, [line for line in large_lines if line in shared])
        self.assertNotEqual(small_lines, large_lines[:1000])
        self.assertIn('g20-r097', two_thousand)
        self.assertNotIn('g01-r048', thousand)

    def test_retained_actual_r001_reconstructs_only_existing_representatives(self):
        terminals = e.parse((HERE / '.local/stage-one-v2/terminal-templates.json').read_bytes())
        self.assertEqual(e.fsha(HERE / '.local/stage-one-v2/terminal-templates.json'), e.TERMINALS_SHA)
        representatives = {}
        for seed in e.SEEDS:
            for line in (HERE / f'.local/stage-one-v2/growth-{seed}.jsonl').read_bytes().splitlines(keepends=True):
                representatives[(seed, e.parse(line)['identifier'])] = line
        self.assertEqual(len(terminals['bundles']), 60)
        for bundle in terminals['bundles']:
            record = e.render_terminal(bundle, 1)  # no actual r002..r097 materialization
            self.assertEqual(e.canonical(record) + b'\n', representatives[(bundle['seed'], record['identifier'])])
        self.assertEqual(e.fsha(HERE / '.local/stage-one-v2/manifest.json'), e.SOURCE_STAGE_SHA)

    def test_exclusive_output_mechanics_toy_payloads_only(self):
        # Mock the gate + payload builder only in this offline unit test. The
        # production CLI exposes no flag or API option to bypass validation.
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            gate = {'root': root, 'approval': {'independent_diagnostic_validation_sha256': '1' * 64},
                    'input_hashes': {'parent-expansion-approval.json': '2' * 64},
                    'generation_source_closure': {'generation_source_closure_sha256': '3' * 64,
                                                  'historical_resolutions': {},
                                                  'current_repository_source_sha256': {}}}
            approval = root / 'parent-expansion-approval.json'
            approval.write_text('toy approval, not actual authorization')
            gate['input_hashes']['parent-expansion-approval.json'] = e.fsha(approval)
            files = {'toy-only-not-study.jsonl': b'{"identifier":"toy"}\n'}
            with mock.patch.object(e, 'validate_approval', return_value=gate), \
                    mock.patch.object(e, 'expanded_files', return_value=(files, [], [])):
                first = e.expand(root)
                output = root / '.local/expanded-v2'
                snapshot = {p.name: p.read_bytes() for p in output.iterdir()}
                second = e.expand(root, True)
                self.assertEqual(first, second)
                self.assertEqual(snapshot, {p.name: p.read_bytes() for p in output.iterdir()})
                target = output / 'toy-only-not-study.jsonl'
                target.write_bytes(b'retain mismatch')
                with self.assertRaisesRegex(ValueError, 'mismatch'):
                    e.expand(root, True)
                self.assertEqual(target.read_bytes(), b'retain mismatch')
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp).resolve()
            gate = {'root': root}
            with mock.patch.object(e, 'validate_approval', return_value=gate), mock.patch.object(e, 'expanded_files') as builder:
                with self.assertRaisesRegex(ValueError, 'No existing'):
                    e.expand(root, True)
                builder.assert_not_called()
                output = root / '.local/expanded-v2'
                output.mkdir(parents=True)
                (output / 'rejected-retain').write_text('retain')
                with self.assertRaisesRegex(ValueError, 'Incomplete/rejected'):
                    e.expand(root)
                builder.assert_not_called()
                self.assertEqual((output / 'rejected-retain').read_text(), 'retain')

    def test_no_truth_or_qrels_synthesis(self):
        source = (HERE / 'expand.py').read_text()
        self.assertNotIn('planned_core_intent_doc_grades', source)
        self.assertNotIn('planned_growth_intent_archetype_grades', source)
        self.assertNotIn('import generate', source)
        self.assertNotIn('import validate', source)
        self.assertNotIn('--skip', source)


if __name__ == '__main__':
    unittest.main()
