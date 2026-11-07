#!/usr/bin/env python3
"""Guarded diagnostic-only expansion of immutable #3887 V2 terminals.

Code alone is NOT authorization. No metadata is materialized until both the
independent diagnostic-validation document and explicit parent approval pass.
No generator/C code, model, backend, ranking, qrels or labels are imported.

Generation history is immutable. The sole permitted historical-source resolution
is the parent-hash-bound archive of first-realization run.py, with its exact old
hash and identical current context() AST. Runtime receipt-logging evolution is
recorded separately; it never rewrites generation provenance or metadata bytes.
"""
import argparse
import ast
import copy
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import re
from collections import Counter

ROOT = Path(__file__).resolve().parent
SEEDS = (38871, 38872, 38873)
SIZES = (60, 1000, 2000)
SOURCE_STAGE_SHA = '9ca143e95b3908ea19d3fca009764fd3692db84b0917a087299d691c6fee610e'
TERMINALS_SHA = 'db9128f2b63ba79a15090f98426a0fa7d868bf4540be06a88b434cd1672d5fe1'
FREEZE_SHA = 'd8746926b03e4e94e78c7d777d9868db0ffb997aa4d99c01d2551224ded0c84e'
CORE_FIELDS = {'catalog', 'description', 'distributions', 'hasQuality', 'identifier', 'keywords',
               'landingPage', 'publisher', 'publishingState', 'quality', 'queryContext', 'tenantId', 'title'}
CHILD_FIELDS = {'description', 'downloadURL', 'format', 'identifier', 'publishingState',
                'queryContext', 'tenantId', 'title'}
SLOT_PATHS = {
    'record_id': {'/identifier', '/landingPage', '/distributions/0/identifier', '/distributions/1/identifier',
                  '/distributions/0/downloadURL', '/distributions/1/downloadURL'},
    'station': {'/description', '/publisher/name', '/queryContext'},
    'year': {'/description', '/queryContext'},
    'month': {'/description', '/queryContext'}}
SLOT_PATTERN = re.compile(r'\{\{([a-z_]+)\}\}')


def require(condition, message):
    if not condition:
        raise ValueError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def fsha(path):
    return sha(Path(path).read_bytes())


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf8')


def pretty(value):
    return json.dumps(value, sort_keys=True, indent=2, ensure_ascii=False).encode('utf8') + b'\n'


def unique_object(pairs):
    obj = {}
    for key, value in pairs:
        require(key not in obj, 'Duplicate JSON object key: ' + key)
        obj[key] = value
    return obj


def parse(data):
    return json.loads(data, object_pairs_hook=unique_object)


def inside(root, relative):
    require(isinstance(relative, str), 'Path must be a string')
    path = Path(relative)
    require(not path.is_absolute(), 'Paths must be threshold-root-relative')
    target = (root / path).resolve()
    require(target.is_relative_to(root.resolve()), 'Path escapes threshold root')
    return target


def projection(metadata, nested=False):
    """Literal production fallback for nonempty frozen strings, no reinjection."""
    if nested:
        return f"Title: {metadata['title']}\nFormat: {metadata['format']}\nDescription: {metadata['description']}\n"
    return f"Title: {metadata['title']}\nDescription: {metadata['description']}\n"


def validate_source_metadata(doc, growth=False):
    require(set(doc) == CORE_FIELDS, 'Unknown/missing dataset source field')
    require(type(doc['tenantId']) is int and doc['tenantId'] == 0, 'Non-neutral dataset tenant')
    require(type(doc['quality']) is float and doc['quality'] == 1.0 and doc['hasQuality'] is True,
            'Dataset quality must be float1.0/hasQualitytrue')
    require(doc['publishingState'] == 'published', 'Unpublished dataset')
    require(doc['catalog'] is None and doc['keywords'] == [], 'Unexpected catalog/keyword content')
    require(set(doc['publisher']) == {'name'} and isinstance(doc['publisher']['name'], str), 'Unknown publisher fields')
    require(isinstance(doc['title'], str) and doc['title'] and isinstance(doc['description'], str) and doc['description'],
            'Empty title or description')
    require(len(doc['title'].split()) <= 12, 'Frozen title budget exceeded')
    require(doc['queryContext'] == projection(doc), 'Root projection differs from literal production format')
    require(doc['landingPage'] == 'https://reserved.invalid/collections/' + doc['identifier'], 'Unexpected landing URL')
    require(isinstance(doc['distributions'], list) and doc['distributions'], 'Missing distributions')
    if growth:
        require([d['format'] for d in doc['distributions']] == ['CSV', 'JSON'], 'Growth formats must be CSV then JSON exactly')
        require(30 <= len(doc['description'].split()) <= 65, 'Frozen growth word budget failed')
    for index, child in enumerate(doc['distributions'], 1):
        require(set(child) == CHILD_FIELDS, 'Unknown/missing nested source field')
        require(type(child['tenantId']) is int and child['tenantId'] == 0, 'Non-neutral distribution tenant')
        require(child['publishingState'] == 'published', 'Unpublished distribution')
        require(child['format'] in ('CSV', 'JSON'), 'Undeclared format')
        require(child['identifier'] == doc['identifier'] + f'-d{index}', 'Unexpected nested identifier')
        require(child['downloadURL'] == f"https://reserved.invalid/collections/{doc['identifier']}/file-{index}.{child['format'].lower()}",
                'Unexpected nested URL')
        require(child['queryContext'] == projection(child, True), 'Nested projection differs from production format')
        require(25 <= len(child['description'].split()) <= 65, 'Frozen nested word budget failed')


def placeholder_bindings(value, pointer=''):
    bindings = []
    if isinstance(value, dict):
        for key, item in value.items():
            escaped = key.replace('~', '~0').replace('/', '~1')
            bindings.extend(placeholder_bindings(item, pointer + '/' + escaped))
    elif isinstance(value, list):
        for index, item in enumerate(value):
            bindings.extend(placeholder_bindings(item, pointer + '/' + str(index)))
    elif isinstance(value, str):
        for match in SLOT_PATTERN.finditer(value):
            bindings.append((pointer, match[1]))
        remainder = SLOT_PATTERN.sub('', value)
        require('{{' not in remainder and '}}' not in remainder, 'Malformed/unknown placeholder syntax')
    return bindings


def scalar_location(doc, pointer):
    require(pointer.startswith('/'), 'Expected JSON pointer')
    parts = [p.replace('~1', '/').replace('~0', '~') for p in pointer[1:].split('/')]
    container = doc
    for part in parts[:-1]:
        container = container[int(part)] if isinstance(container, list) else container[part]
    key = int(parts[-1]) if isinstance(container, list) else parts[-1]
    require(isinstance(container[key], str), 'Typed slot position must be a string scalar')
    return container, key


def render_terminal(bundle, replica):
    """Fixed full-field bundle + four typed neutral slots, never new free prose."""
    require(type(replica) is int and 1 <= replica <= 97, 'Replica outside frozen range1..97')
    archetype = bundle['archetype_id']
    require(re.fullmatch(r'g(?:0[1-9]|1[0-9]|20)', archetype) is not None, 'Unknown growth archetype')
    require(bundle['seed'] in SEEDS, 'Unknown seed style')
    require(set(bundle) == {'archetype_id', 'claim_set', 'metadata', 'seed', 'slot_bindings'}, 'Unexpected bundle field')
    document = copy.deepcopy(bundle['metadata'])
    declared = []
    for binding in bundle['slot_bindings']:
        require(set(binding) == {'json_pointer', 'slot'}, 'Unknown slot-binding field')
        slot, pointer = binding['slot'], binding['json_pointer']
        require(pointer in SLOT_PATHS.get(slot, set()), 'Slot not allowed at this exact pointer')
        declared.append((pointer, slot))
    observed = placeholder_bindings(document)
    require(Counter(declared) == Counter(observed), 'Slot bindings do not exactly cover all placeholders')
    require(len(set(declared)) == len(declared), 'Repeated slot binding')
    expected_pairs = {(pointer, slot) for slot, pointers in SLOT_PATHS.items() for pointer in pointers}
    require(set(declared) == expected_pairs, 'Missing frozen typed slot position')
    require(document['description'].count('{{station}}') == 1 and
            document['description'].count('Filed by {{station}}.') == 1, 'Station only in single declared provenance clause')
    require(document['description'].count('Metadata release: {{year}}, month {{month}}.') == 1,
            'Year/month only in metadata release clause')
    # Projections are checked BEFORE substitution as well: slots cannot insert
    # hidden measurements or alter the relation between source and derived text.
    require(document['queryContext'] == projection(document), 'Template root projection mismatch')
    for child in document['distributions']:
        require(child['queryContext'] == projection(child, True), 'Template nested projection mismatch')
    values = {'record_id': f'{archetype}-r{replica:03}', 'station': f'Station {replica:03}',
              'year': str(2010 + ((replica - 1) % 16)), 'month': str(1 + ((replica - 1) % 12))}
    for pointer in dict.fromkeys(p for p, _ in declared):
        container, key = scalar_location(document, pointer)
        container[key] = SLOT_PATTERN.sub(lambda match: values[match[1]], container[key])
    require(not placeholder_bindings(document), 'Unexpanded placeholder')
    validate_source_metadata(document, growth=True)
    return document


def expected_ids(size):
    require(type(size) is int and size in SIZES, 'Only registered catalog sizes60/1000/2000')
    replicas = {60: 0, 1000: 47, 2000: 97}[size]
    return [f't{i:03}' for i in range(1, 61)] + [f'g{a:02}-r{r:03}' for a in range(1, 21) for r in range(1, replicas + 1)]


def pinned_file(root, relative, expected):
    path = inside(root, relative)
    require(re.fullmatch('[0-9a-f]{64}', expected or '') is not None, 'Invalid SHA256 binding')
    require(fsha(path) == expected, 'Hash mismatch: ' + relative)
    return parse(path.read_bytes())


def context_ast(source_bytes):
    """Inspect syntax only; neither historical nor current runner is imported."""
    module = ast.parse(source_bytes.decode('utf8'))
    functions = [node for node in module.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and node.name == 'context']
    require(len(functions) == 1 and isinstance(functions[0], ast.FunctionDef),
            'Need one unambiguous top-level synchronous context function')
    return ast.dump(functions[0], annotate_fields=True, include_attributes=False).encode('utf8')


def resolve_generation_sources(root, stage, approval):
    """One explicit historical runner exception, no generic source-drift bypass."""
    proof_path = 'generation-source-closure.json'
    proof_sha = approval.get('generation_source_closure_sha256')
    require(isinstance(proof_sha, str), 'Parent must bind generation_source_closure_sha256')
    require(inside(root, proof_path).is_file(), 'Missing generation source closure proof')
    proof = pinned_file(root, proof_path, proof_sha)
    original = 'search-relevance-eval/run.py'
    archive_path = '.local/source-archive/run-at-first-realization.py'
    require(original in stage['source_sha256'], 'Historical runner absent from stage receipt')
    expected = stage['source_sha256'][original]
    for key, value in {'schema_version': 1, 'original_source': original,
                       'original_source_sha256': expected, 'archive_sha256': expected,
                       'archived_source_path': archive_path,
                       'context_function_ast_byte_representation_identical': True,
                       'corpus_bytes_unchanged': True, 'queries_labels_unchanged': True,
                       'stage_manifest_unchanged': True}.items():
        require(type(proof.get(key)) is type(value) and proof[key] == value,
                'Historical source proof missing/wrong binding: ' + key)
    archive = inside(root, archive_path)
    require(fsha(archive) == expected, 'Historical archive bytes changed')
    repository = root.parent.parent.resolve()
    runtime = inside(repository, original)
    runtime_sha = fsha(runtime)
    require(proof.get('current_runtime_sha256') == runtime_sha, 'Current runtime hash differs from historical closure proof')
    require(context_ast(archive.read_bytes()) == context_ast(runtime.read_bytes()),
            'Current context AST differs from archived first-realization projection')
    current_hashes = {}
    resolutions = {}
    for path, old_hash in stage['source_sha256'].items():
        actual = fsha(inside(repository, path))
        current_hashes[path] = actual
        if actual != old_hash:
            require(path == original, 'Unapproved generation source drift: ' + path)
            require(old_hash == expected, 'Runner expected hash differs from archive proof')
            resolutions[path] = {'generation_source_sha256': old_hash,
                                 'generation_source_archive_path': archive_path,
                                 'generation_source_archive_sha256': expected,
                                 'current_runtime_sha256': actual,
                                 'context_ast_identical': True,
                                 'resolution_proof_path': proof_path, 'resolution_proof_sha256': proof_sha}
    return {'root_relative_input_sha256': {proof_path: proof_sha, archive_path: expected},
            'current_repository_source_sha256': current_hashes, 'historical_resolutions': resolutions,
            'generation_source_closure_sha256': proof_sha}


def validate_approval(root=ROOT):
    """Fail closed BEFORE any replica materialization or output creation.

    Contract is deliberately explicit, not a generic pass/status-string bypass.
    Parent and C must independently bind identical fixed input bytes. Only the
    diagnostic-nonconformant status is accepted; never a strict fixture pass.
    """
    root = Path(root).resolve()
    approval_path = root / 'parent-expansion-approval.json'
    require(approval_path.is_file(), 'Missing explicit parent expansion approval; code only, no expansion')
    approval = parse(approval_path.read_bytes())
    require(type(approval.get('schema_version')) is int and approval['schema_version'] == 1,
            'Unsupported parent approval schema')
    for key, expected in {'approved_by': 'parent-agent', 'expansion_allowed': True,
                          'diagnostic_only': True, 'promotion_allowed': False,
                          'forced_recommendation': 'D', 'spec_freeze_sha256': FREEZE_SHA,
                          'stage_manifest_sha256': SOURCE_STAGE_SHA,
                          'terminal_templates_sha256': TERMINALS_SHA,
                          'approved_code_sha256': fsha(Path(__file__))}.items():
        require(type(approval.get(key)) is type(expected) and approval[key] == expected,
                'Parent approval missing/wrong binding: ' + key)
    # Mandatory independent validation reference; path is data, never code.
    validation_path = approval.get('independent_diagnostic_validation_path')
    validation_sha = approval.get('independent_diagnostic_validation_sha256')
    require(isinstance(validation_path, str), 'Independent validation path required')
    validation = pinned_file(root, validation_path, validation_sha)
    for key, expected in {'schema_version': 1, 'complete_actual_label_evidence': True,
                          'diagnostic_only': True, 'promotion_allowed': False,
                          'forced_recommendation': 'D', 'spec_freeze_sha256': FREEZE_SHA,
                          'stage_manifest_sha256': SOURCE_STAGE_SHA,
                          'terminal_templates_sha256': TERMINALS_SHA}.items():
        require(type(validation.get(key)) is type(expected) and validation[key] == expected,
                'Independent diagnostic validation missing/wrong binding: ' + key)
    require(validation.get('status') == 'audited_nonconformant_diagnostic_only',
            'Independent status must be audited_nonconformant_diagnostic_only; strict pass is forbidden')
    # No truthy shorthand: completion count, known/U closure and terminal-only
    # substitution authorization must be explicitly certified by independent C.
    for key, expected in {'manual_actual_record_count': 240, 'reviewed_terminal_bundle_count': 60,
                          'all_known_pairs_inspected': True, 'unresolved_pairs_explicitly_U': True,
                          'terminal_substitution_only_expansion_allowed': True}.items():
        require(type(validation.get(key)) is type(expected) and validation[key] == expected,
                'Independent actual-evidence gate missing/wrong value: ' + key)
    freeze_path = root / 'freeze.py'
    require(fsha(root / 'spec-freeze.json') == FREEZE_SHA, 'Spec-freeze changed')
    registration = parse((root / 'spec-freeze.json').read_bytes())
    require(fsha(freeze_path) == registration['freeze_tool_sha256'], 'Frozen checker changed')
    loader = importlib.util.spec_from_file_location('threshold_expand_frozen_checker', freeze_path)
    frozen = importlib.util.module_from_spec(loader)
    loader.loader.exec_module(frozen)
    frozen.verify(root)
    nonconformance = parse((root / 'frozen-design-nonconformance.json').read_bytes())
    require(nonconformance.get('status') == 'strict_fixture_conformance_failed' and
            nonconformance.get('affected_record_id') == 't051', 'Required frozen nonconformance disclosure missing')
    stage = pinned_file(root, '.local/stage-one-v2/manifest.json', SOURCE_STAGE_SHA)
    terminals = pinned_file(root, '.local/stage-one-v2/terminal-templates.json', TERMINALS_SHA)
    require(stage.get('artifact_version') == 2 and stage.get('stage') == 'stage_one', 'Wrong source realization version')
    require(stage['spec_freeze_sha256'] == FREEZE_SHA, 'Stage uses another frozen architecture')
    # Every original source must match, except the explicitly parent-bound
    # archived run.py with unchanged context AST and separately pinned runtime.
    source_closure = resolve_generation_sources(root, stage, approval)
    require(len(stage['corpora']) == 3 and len(stage['templates']) == 3, 'Incomplete source inventory')
    require(stage['terminal_templates']['sha256'] == TERMINALS_SHA, 'Source terminal binding differs')
    require(len(terminals['bundles']) == 60, 'Need exactly60 reviewed terminal bundles')
    expected_bundle_ids = {(seed, f'g{i:02}') for seed in SEEDS for i in range(1, 21)}
    actual_bundle_ids = [(b['seed'], b['archetype_id']) for b in terminals['bundles']]
    require(set(actual_bundle_ids) == expected_bundle_ids and len(set(actual_bundle_ids)) == 60, 'Missing/duplicate bundle')
    input_hashes = {'spec-freeze.json': FREEZE_SHA, '.local/stage-one-v2/manifest.json': SOURCE_STAGE_SHA,
                    '.local/stage-one-v2/terminal-templates.json': TERMINALS_SHA,
                    'frozen-design-nonconformance.json': fsha(root / 'frozen-design-nonconformance.json'),
                    'parent-expansion-approval.json': fsha(approval_path), validation_path: validation_sha,
                    'expand.py': fsha(Path(__file__))}
    input_hashes.update(source_closure['root_relative_input_sha256'])
    source_rows = {}
    for group, count in (('corpora', 60), ('templates', 20)):
        seen_seeds = set()
        for entry in stage[group]:
            seed = entry['seed']
            require(seed in SEEDS and seed not in seen_seeds and entry['record_count'] == count, 'Wrong source count/seed')
            seen_seeds.add(seed)
            path = inside(root, entry['path'])
            require(fsha(path) == entry['sha256'], 'Source JSONL hash changed')
            input_hashes[entry['path']] = entry['sha256']
            lines = path.read_bytes().splitlines(keepends=True)
            require(len(lines) == count, 'Wrong source row count')
            rows = []
            for line in lines:
                require(line.endswith(b'\n'), 'Raw row missing LF')
                record = parse(line)
                require(line == canonical(record) + b'\n', 'Raw source is not the bound canonical+LF serialization')
                identifier = record['identifier']
                require(stage['raw_record_sha256'][str(seed)][identifier] == sha(line), 'Raw row hash mismatch')
                require(stage['canonical_record_sha256'][str(seed)][identifier] == sha(canonical(record)), 'Canonical row hash mismatch')
                validate_source_metadata(record, group == 'templates')
                rows.append((identifier, line))
            expected = expected_ids(60) if group == 'corpora' else [f'g{i:02}-r001' for i in range(1, 21)]
            require([identifier for identifier, _ in rows] == expected, 'Unexpected source ID/order')
            source_rows[(seed, group)] = rows
    return {'root': root, 'approval': approval, 'validation': validation, 'stage': stage,
            'terminals': terminals, 'source_rows': source_rows, 'input_hashes': input_hashes,
            'generation_source_closure': source_closure}


def materialize_canonical_seed(gate, seed):
    """Call only after validate_approval; original core raw bytes are copied intact."""
    require(seed in SEEDS, 'Unknown seed')
    rows = dict(gate['source_rows'][(seed, 'corpora')])
    representatives = dict(gate['source_rows'][(seed, 'templates')])
    bundles = {b['archetype_id']: b for b in gate['terminals']['bundles'] if b['seed'] == seed}
    for archetype in (f'g{i:02}' for i in range(1, 21)):
        for replica in range(1, 98):
            doc = render_terminal(bundles[archetype], replica)
            line = canonical(doc) + b'\n'
            if replica == 1:
                require(line == representatives[doc['identifier']], 'Reviewed representative no longer reconstructs exactly')
            require(doc['identifier'] not in rows, 'Duplicate record identifier')
            rows[doc['identifier']] = line
    require(set(rows) == set(expected_ids(2000)) and len(rows) == 2000, 'Wrong full population')
    return rows


def record_receipt(seed, size, rows):
    records = []
    for identifier in expected_ids(size):
        line = rows[identifier]
        doc = parse(line)
        records.append({'identifier': identifier, 'raw_record_sha256': sha(line),
                        'canonical_record_sha256': sha(canonical(doc)),
                        'source': {'kind': 'unchanged_core_raw_row', 'path': f'.local/stage-one-v2/core-{seed}.jsonl'}
                        if identifier.startswith('t') else
                        {'kind': 'literal_reviewed_terminal_substitution', 'seed': seed,
                         'archetype_id': identifier.split('-')[0], 'replica': int(identifier[-3:]),
                         'terminal_templates_sha256': TERMINALS_SHA}})
    return {'schema_version': 1, 'seed': seed, 'catalog_size': size,
            'record_hash_conventions': {'raw_record_sha256': 'SHA256 exact raw JSONL row bytes INCLUDING LF',
                                        'canonical_record_sha256': "SHA256 sort_keys=True,separators=(',',':'),ensure_ascii=False UTF8 WITHOUT LF"},
            'records': records}


def expanded_files(gate):
    files, corpora, receipts = {}, [], []
    for seed in SEEDS:
        rows = materialize_canonical_seed(gate, seed)
        for size in SIZES:
            name = f'seed-{seed}-n{size}.jsonl'
            ids = expected_ids(size)
            data = b''.join(rows[identifier] for identifier in ids)
            files[name] = data
            receipt_name = f'seed-{seed}-n{size}-receipt.json'
            files[receipt_name] = pretty(record_receipt(seed, size, rows))
            corpora.append({'seed': seed, 'catalog_size': size, 'path': '.local/expanded-v2/' + name,
                            'sha256': sha(data), 'record_count': size})
            receipts.append({'seed': seed, 'catalog_size': size, 'path': '.local/expanded-v2/' + receipt_name,
                             'sha256': sha(files[receipt_name]), 'record_count': size})
    return files, corpora, receipts


def expand(root=ROOT, verify_existing=False):
    # This MUST stay the first operation capable of reaching materialization.
    gate = validate_approval(root)
    root = gate['root']
    output = root / '.local/expanded-v2'
    # A symlink must not redirect the fixed destination elsewhere.
    require(not output.is_symlink() and output.resolve().is_relative_to(root), 'Unsafe expansion destination')
    if output.exists():
        require((output / 'manifest.json').is_file(), 'Incomplete/rejected output retained; will not overwrite')
    elif verify_existing:
        raise ValueError('No existing expanded output to verify')
    files, corpora, receipts = expanded_files(gate)
    artifact_hashes = {name: sha(data) for name, data in files.items()}
    fixed = {'schema_version': 1, 'stage': 'expanded', 'diagnostic_only': True,
             'promotion_allowed': False, 'forced_recommendation': 'D',
             'strict_fixture_conformance_passed': False, 'metadata_labels_or_queries_repaired': False,
             'spec_freeze_sha256': FREEZE_SHA,
             'stage_validation_sha256': gate['approval']['independent_diagnostic_validation_sha256'],
             'parent_approval_sha256': gate['input_hashes']['parent-expansion-approval.json'],
             'source_stage_manifest_sha256': SOURCE_STAGE_SHA, 'terminal_templates_sha256': TERMINALS_SHA,
             'expansion_code_sha256': fsha(Path(__file__)), 'input_sha256': gate['input_hashes'],
             'generation_source_closure_sha256': gate['generation_source_closure']['generation_source_closure_sha256'],
             'generation_source_resolution': gate['generation_source_closure']['historical_resolutions'],
             'current_repository_source_sha256': gate['generation_source_closure']['current_repository_source_sha256'],
             'corpora': corpora, 'record_receipts': receipts, 'artifact_sha256': artifact_hashes,
             'ordering': 'core t001..t060 then archetype g01..g20 then replica ascending within each archetype',
             'nested_subset': 'Every shared ID has EXACT same raw JSONL line at60/1000/2000; level1000 is NOT a literal first1000-lines prefix of2000.',
             'growth_semantic_diversity': '20 archetypes x3 reviewed styles, not1940 independent phenomena per seed',
             'qrels_generated': False, 'U_coerced_to_zero': False, 'no_embedding': True, 'no_search': True,
             'no_model_calls': True, 'no_native_comparisons': True,
             'nonconformance_disclosure_path': 'frozen-design-nonconformance.json',
             'independent_expanded_row_reconstruction_still_required': True}
    if output.exists():
        retained = parse((output / 'manifest.json').read_bytes())
        require(set(retained) == set(fixed) | {'created_utc'}, 'Unexpected expanded manifest keys')
        require({k: v for k, v in retained.items() if k != 'created_utc'} == fixed, 'Manifest/source/approval changed; never overwrite')
        require(set(p.name for p in output.iterdir()) == set(files) | {'manifest.json'}, 'Unknown/missing expanded artifact')
        for name, data in files.items():
            require((output / name).read_bytes() == data, 'Expanded artifact hash/bytes mismatch: ' + name)
    else:
        # Validate all immutable inputs again immediately before exclusive create.
        for relative, expected in gate['input_hashes'].items():
            require(fsha(inside(root, relative)) == expected, 'Input changed during expansion preparation')
        for relative, expected in gate['generation_source_closure']['current_repository_source_sha256'].items():
            require(fsha(inside(root.parent.parent.resolve(), relative)) == expected,
                    'Runtime/source changed during expansion preparation: ' + relative)
        output.mkdir(parents=True, exist_ok=False)
        for name, data in files.items():
            with (output / name).open('xb') as stream:
                stream.write(data)
        retained = {**fixed, 'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        with (output / 'manifest.json').open('xb') as stream:
            stream.write(pretty(retained))
    return {'stage': 'expanded', 'diagnostic_only': True, 'forced_recommendation': 'D',
            'corpus_count': 9, 'manifest_sha256': fsha(output / 'manifest.json'),
            'independent_expanded_row_reconstruction_still_required': True}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('check-approval', 'expand', 'verify-existing'))
    args = parser.parse_args(argv)
    if args.action == 'check-approval':
        gate = validate_approval(ROOT)
        result = {'approval_checked': True, 'metadata_materialized': False,
                  'diagnostic_only': True, 'forced_recommendation': 'D',
                  'parent_approval_sha256': gate['input_hashes']['parent-expansion-approval.json']}
    else:
        result = expand(ROOT, args.action == 'verify-existing')
    print(json.dumps(result, sort_keys=True))


if __name__ == '__main__':
    main()
