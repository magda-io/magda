#!/usr/bin/env python3
"""Offline frozen-plan metadata realization. No network, embeddings or search.

JSONL rows use Magda's indexed DataSet/Distribution shape, not registry aspects.
Expected qrels are a mechanical copy of frozen intent_doc_grades, NOT a review.
Existing output is never overwritten: --verify-existing permits identical bytes.
"""
import argparse
import collections
import datetime as dt
import hashlib
import itertools
import json
from pathlib import Path
import random
import re
import statistics

try:
    from . import freeze
except ImportError:
    import freeze

ROOT = Path(__file__).resolve().parent
# Fail closed even for callers importing this module rather than invoking CLI.
FROZEN = freeze.verify(ROOT)

PRODUCTS = {
    'cacao_crop': ('cacao trees grown as a crop', 'cacao trees'),
    'cacao_beans': ('postharvest cacao beans', 'cacao beans'),
    'cacao_seedlings': ('cacao seedlings raised for planting', 'cacao seedlings'),
    'solid_milk_chocolate': ('solid milk chocolate bars', 'milk chocolate'),
    'solid_dark_chocolate': ('solid dark chocolate bars without dairy ingredients', 'dark chocolate'),
    'solid_chocolate': ('solid chocolate confectionery bars', 'chocolate bars'),
    'soft_chocolate_filling': ('soft chocolate filling for confectionery centres', 'soft chocolate filling'),
    'dessert_chocolate_ingredient': ('edible chocolate ingredients reserved for dessert preparation', 'dessert ingredients'),
    'non_edible_chocolate_scented_material': ('non-edible chocolate-scented display material for confectionery shops', 'scented display material'),
    'confectionery_factory': ('chocolate confectionery factory production equipment', 'confectionery factory'),
    'confectionery_factory_ornamental_plants': ('ornamental plants and their maintenance tools at a confectionery factory', 'ornamental plants'),
    'drinking_chocolate_powder': ('drinking chocolate powder intended for hot beverages', 'drinking chocolate powder'),
    'dessert_cocoa_powder': ('baking-only dessert cocoa powder not formulated as a beverage mix', 'baking cocoa powder'),
    'chocolate_dairy_beverage': ('liquid chocolate-flavoured dairy milk beverage', 'chocolate milk'),
    'chocolate_oat_beverage': ('liquid chocolate-flavoured oat beverage containing no dairy milk', 'chocolate oat drink'),
    'running_shoe': ('complete running shoes for road use', 'running shoes'),
    'shoe_component': ('replacement shoe components supplied separately from complete footwear', 'shoe components'),
    'hydraulic_pump': ('hydraulic fluid circulation pumps', 'hydraulic pumps'),
    'pump_interface_standard': ('a fictional hydraulic-pump interface specification, not an operating pump', 'pump interface specification'),
    'temperature_probe': ('temperature sensor probes for cold-room equipment', 'temperature probes'),
    'friction_survey': ('a pavement friction survey release, not footwear testing', 'pavement survey'),
    'torque_gauge': ('torque gauges for mechanical fasteners, not temperature sensors', 'torque gauges'),
}
PROCESSES = {
    'field_pest_management': ('field pest management trials', 'field pest trials'),
    'postharvest_pest_storage': ('postharvest pest inspection of warehouse bags, rather than crop treatment in the field', 'warehouse pest inspection'),
    'harvest_yield': ('crop harvest yield recording', 'harvest yield'),
    'bean_fermentation': ('fermentation of harvested beans before drying, not dairy drink processing', 'bean fermentation'),
    'bean_drying': ('drying of beans on racks after fermentation has ended', 'bean drying'),
    'nursery_propagation': ('nursery propagation of young crop plants', 'nursery propagation'),
    'factory_landscaping': ('factory grounds landscaping with young cacao plants, rather than nursery propagation', 'grounds landscaping'),
    'bar_packaging': ('wrapping and package performance assessment', 'wrapper assessment'),
    'bar_formulation': ('bar recipe preparation rather than wrapper testing', 'bar recipe preparation'),
    'texture_testing': ('texture testing of chocolate by mechanical loading', 'chocolate texture testing'),
    'colour_testing': ('visual colour inspection, rather than mechanical snap testing', 'colour inspection'),
    'ingredient_storage': ('storage assessment before use of the material', 'ingredient storage'),
    'ingredient_marketing': ('marketing and promotional dispatch for dessert ingredients, rather than storage experiments', 'ingredient marketing'),
    'factory_sanitation': ('sanitation and equipment cleaning verification', 'equipment sanitation'),
    'factory_production_throughput': ('factory production throughput recording rather than sanitation verification', 'production throughput'),
    'hot_drink_reconstitution': ('hot-drink reconstitution bench testing with water', 'hot-water reconstitution'),
    'dessert_reconstitution': ('dessert paste preparation using a drink powder, rather than hot beverage preparation', 'dessert paste preparation'),
    'refrigerated_shelf_life': ('refrigerated shelf-life assessment', 'refrigerated shelf life'),
    'ambient_transport_logistics': ('ambient transport logistics for sealed cartons, not refrigerated shelf-life trials', 'ambient carton transport'),
    'drink_formulation': ('liquid drink recipe formulation', 'drink formulation'),
    'container_design': ('bottle and container design for a drink, rather than recipe formulation', 'bottle design'),
    'beverage_fermentation': ('fermentation of a chocolate-flavoured liquid beverage, not postharvest beans', 'beverage fermentation'),
    'beverage_pasteurization': ('thermal pasteurization of a drink rather than starter-driven fermentation', 'drink pasteurization'),
    'wet_pavement_testing': ('wet pavement traction testing', 'wet-road traction'),
    'dry_surface_testing': ('dry-surface footwear bench testing with no water applied', 'dry-surface testing'),
    'indoor_low_noise_testing': ('indoor low-noise testing during hydraulic circulation', 'indoor acoustic testing'),
    'coldroom_calibration': ('cold-room temperature calibration', 'cold-room calibration'),
    'unloaded_bench_inventory': ('unloaded bench inventory with no operating calibration or circulation trial', 'bench inventory'),
    'technical_documentation': ('technical documentation and release inspection', 'technical documentation'),
}
# These are actual described table columns, not searchable canonical fact tags.
# Every numeric example is generated independently for each study and seed.
COLUMNS = {
    'pest_counts': ('insects counted per inspected tree', 'count', 3, 28),
    'control_treatment': ('applied pest-control treatment', 'category: neem oil / untreated', None, None),
    'treatment_application_rate': ('treatment application volume', 'litres/hectare', 2, 12),
    'harvest_mass': ('harvested bean mass', 'kg', 140, 920),
    'hectares': ('harvested plot area', 'hectares', 1, 8),
    'season': ('harvest season', 'category: main / secondary', None, None),
    'fermentation_duration': ('bean fermentation elapsed time', 'hours', 72, 156),
    'bean_temperature': ('bean core temperature', 'degrees C', 34, 49),
    'fermentation_batch_mass_kg': ('fermentation batch mass', 'kg', 55, 280),
    'seedling_survival': ('surviving seedlings at follow-up', 'percent', 70, 98),
    'propagation_method': ('propagation method used', 'category: graft / cutting', None, None),
    'rooting_duration_days': ('time until roots appeared', 'days', 12, 40),
    'wrapper_material': ('wrapper material examined', 'category: foil / coated paper', None, None),
    'barrier_performance': ('wrapper oxygen transmission', 'cm3/m2/day', 1, 18),
    'seal_failure_rate': ('failed wrapper seals', 'percent of seals tested', 1, 9),
    'fracture_force': ('force at fracture', 'newtons', 8, 45),
    'tempering_conditions': ('tempering hold temperature and duration', 'degrees C and minutes', 27, 32),
    'particle_size_micrometres': ('particle diameter', 'micrometres', 12, 40),
    'storage_temperature': ('storage chamber temperature', 'degrees C', 2, 8),
    'ingredient_quality': ('ingredient quality assessment score', 'points on a 0-100 scale', 60, 95),
    'moisture_percent': ('material moisture by mass', 'percent', 1, 6),
    'equipment_cleaning': ('equipment cleaning cycle completed', 'recorded cycle: rinse / detergent wash', None, None),
    'microbial_swabs': ('microbial growth from surface swabs', 'CFU/swab', 5, 110),
    'residue_mass_mg': ('residue remaining on cleaned surface', 'mg', 1, 12),
    'powder_dose': ('powder mass added per preparation', 'g', 12, 30),
    'water_temperature': ('added water temperature', 'degrees C', 65, 92),
    'dissolution_time_seconds': ('time to complete powder dissolution', 'seconds', 15, 95),
    'spoilage_days': ('elapsed time until observed spoilage', 'days', 4, 16),
    'microbial_count_cfu_per_ml': ('viable microbes in beverage samples', 'CFU/ml', 20, 300),
    'cocoa_fraction': ('cocoa fraction in liquid recipe', 'percent by mass', 1, 5),
    'sugar_fraction': ('sugar fraction in liquid recipe', 'percent by mass', 4, 12),
    'liquid_viscosity': ('liquid viscosity', 'mPa s', 4, 35),
    'starter_culture': ('starter culture inoculated', 'recorded culture: Lactobacillus / Streptococcus', None, None),
    'acidification_curve': ('acidification time course', 'paired hours and pH readings', 2, 8),
    'residual_sugar_g_per_litre': ('residual sugar after fermentation', 'g/litre', 8, 35),
    'wet_friction_coefficient': ('wet sliding friction coefficient', 'dimensionless', 0.35, 0.85),
    'surface_roughness_mm': ('tested pavement surface roughness', 'mm', 0.2, 1.8),
    'water_film_depth_mm': ('water-film depth on pavement', 'mm', 0.3, 2),
    'noise_decibels': ('operating sound pressure level', 'dB(A)', 35, 58),
    'sound_measurement_distance_m': ('microphone distance from operating pump', 'm', 1, 3),
    'flow_rate': ('hydraulic fluid flow rate', 'litres/minute', 8, 42),
    'calibration_error': ('probe reading minus reference temperature', 'degrees C', -0.3, 0.3),
    'minus20_to_plus5_C': ('calibration test-point range', '-20 to +5 degrees C inclusive', None, None),
    'reference_instrument_uncertainty_C': ('reference thermometer uncertainty', 'degrees C', 0.01, 0.08),
    'operational_count': ('completed operations', 'count', 12, 90),
    'reference_period': ('reporting interval', 'calendar month', None, None),
    'site_identifier': ('facility location code', 'categorical site code', None, None),
    'unit_price': ('invoiced unit price', 'AUD/unit', 2, 25),
    'shipment_count': ('dispatched consignments', 'count', 8, 75),
    'retail_cost': ('advertised retail cost', 'AUD/unit', 45, 280),
    'package_dimensions': ('shipping carton dimensions', 'length x width x height in mm', 120, 360),
    'unit_mass': ('unloaded unit mass', 'g', 120, 1800),
    'technical_characteristics': ('physical specification inspection', 'dimensions in mm', 12, 120),
    'release_identity': ('documented release identity', 'edition code', None, None),
}
SITES = ('Alderbank', 'Bramble Hill', 'Cedar Reach', 'Dune Valley', 'Elm Crossing',
         'Fern Hollow', 'Granite Bend', 'Hazel Ridge', 'Ivy Brook', 'Juniper Vale',
         'Kestrel Point', 'Linden Grove', 'Maple Quay', 'North Meadow', 'Oak Terrace',
         'Pine Basin', 'Quartz Field', 'Reed Marsh', 'Silver Creek', 'Tern Inlet')
PUBLISHERS = tuple(f'{name} {suffix}' for name, suffix in (
    ('Alder', 'Applied Research Centre'), ('Bramble', 'Technical Institute'),
    ('Cedar', 'Materials Laboratory'), ('Dune', 'Agricultural Centre'),
    ('Elm', 'Process Research Group'), ('Fern', 'Measurement Institute'),
    ('Granite', 'Product Studies Unit'), ('Hazel', 'Experimental Station'),
    ('Ivy', 'Food Research Centre'), ('Juniper', 'Engineering Laboratory'),
    ('Kestrel', 'Analytical Institute'), ('Linden', 'Quality Research Centre'),
    ('Maple', 'Research Cooperative'), ('North', 'Technical College'),
    ('Oak', 'Testing Laboratory'), ('Pine', 'Field Studies Centre')))
# Domain-specific, non-measurement editorial details. They do not introduce a
# missing target column or deny a product's ontological attributes.
EDITORIAL = (
    'The catalogue synopsis distinguishes the subject of the study from the organisation holding the records. File names refer to the deposited edition, and row identifiers remain local to that edition.',
    'Repeated entries are retained in their original sequence. The accompanying notes explain the row layout and the meaning of blank cells; a blank entry is not a recorded zero and should not be converted without consulting those notes.',
    'The depositor prepared a compact overview for readers assessing whether the files fit their intended reuse. It describes the material included here rather than making claims about other installations or every product sold under a similar name.',
    'Readers can join the files using the local observation key. The release contains no personal contacts, commercial addresses or individual participants. Institutional and location names are fictional catalogue context and do not identify real facilities.',
    'The archive preserves the submitted ordering and spelling. Editorial notes concern interpretation and reuse only; they do not add further experimental variables. Comparisons with another release should account for its separate sampling and reporting arrangements.',
    'This edition includes a plain-language field guide for the variables listed in the synopsis. The guide separates categorical entries from quantities and explains the notation used for unavailable cells without supplying additional observations.',
)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')) + '\n').encode()


def jsonl_bytes(rows):
    return b''.join(encoded(row) for row in rows)


def load_design(root=ROOT):
    root = Path(root)
    freeze.verify(root)
    return json.loads((root / 'generation-spec.json').read_text()), freeze.jsonl(root / 'query-spec.jsonl')


def rng_for(seed, identifier, stream='prose'):
    return random.Random(int(digest(f'{seed}:{identifier}:{stream}'.encode()), 16))


def column_text(fact, rng, site, identifier):
    label, unit, low, high = COLUMNS[fact]
    if low is None:
        example = {'reference_period': '2024-06', 'site_identifier': site,
                   'release_identity': identifier}.get(fact)
        return f'{label} ({unit}' + (f'; e.g. {example})' if example else ')')
    value = round(rng.uniform(low, high), 2)
    if fact in ('pest_counts', 'operational_count', 'shipment_count'):
        value = int(round(value))
    if fact == 'tempering_conditions':
        return f'{label} ({value} degrees C for {rng.randint(8, 25)} minutes in an example row)'
    if fact == 'acidification_curve':
        return f'{label} (hours/pH; example pairs 0/6.6, {value}/4.7)'
    if fact == 'package_dimensions':
        return f'{label} ({unit}; e.g. {int(value)} x 90 x 65)'
    return f'{label} ({unit}; e.g. {value:g})'


def natural_title(plan, rng, site, seed):
    requirements = plan.get('identifier_requirements', {})
    if requirements.get('exact_title'):
        return requirements['exact_title']
    product = PRODUCTS[plan['product']][1]
    process = PROCESSES[plan['process']][1]
    # 12 grammatical constructions, with subject-specific wording and separately
    # drawn nouns. Each form has 2-4 variants, avoiding category-prefix titles.
    noun = rng.choice(('observations', 'records', 'study', 'assessment'))
    forms = (
        f'{site} {process} {noun}',
        f'{process.capitalize()} of {product} at {site}',
        f'Following {site} {product} through {process}',
        f'What the {site} {product} trials recorded',
        f'{product.capitalize()} during the {site} {noun}',
        f'A closer look at {process} in {site}',
        f'From {site}: {product} {noun}',
        f'{noun.capitalize()} from {site} {process}',
        f'Inside the {site} {process} study',
        f'{process.capitalize()} revisited at {site}',
        f'The {site} series on {product}',
        f'{product.capitalize()} and {process} at {site}',
    )
    # Forty-eight surface forms; deterministic balanced assignment keeps each
    # structural title form below six uses across the 180-record population.
    forms += (
        f'{site}: a {process} field report',
        f'{product.capitalize()} under examination at {site}',
        f'{process.capitalize()} evidence from {site}',
        f'The deposited {site} {process} series',
        f'{site} results concerning {product}',
        f'Looking back on {site} {process}',
        f'Notes on {product} from {site}',
        f'{product.capitalize()} in the {site} record',
        f'{process.capitalize()} across the {site} series',
        f'The {product} investigation at {site}',
        f'{site} documentation of {process}',
        f'Examining {process} at {site}',
        f'A {site} account of {product}',
        f'{process.capitalize()} as recorded at {site}',
        f'{site} technical notes on {product}',
        f'The {site} record of {process}',
        f'{product.capitalize()}: the {site} assessment',
        f'An investigation of {process} at {site}',
        f'Understanding {product} through the {site} study',
        f'Working records for {site} {process}',
        f'{site} {product}: a study archive',
        f'{process.capitalize()} and the {site} observations',
        f'Interpreting the {site} {product} series',
        f'Archived {product} observations from {site}',
        f'A practical examination of {process} at {site}',
        f'{product.capitalize()} records deposited by {site}',
        f'Study notes from {site} on {process}',
        f'{site} observation archive for {product}',
        f'{process.capitalize()}: an account from {site}',
        f'{product.capitalize()} assessed in the {site} series',
        f'The {site} deposit on {process}',
        f'Exploring {process} through {site} records',
        f'{site} observations of {product}',
        f'{product.capitalize()} at {site}: technical account',
        f'{process.capitalize()} in the {site} investigation',
        f'From field notes to archive: {site} {product}',
    )
    ordinal = int(plan['id'][1:]) - 1 + (100 if plan['id'].startswith('b') else 0)
    title = forms[(ordinal + rng_for(seed, 'titles').randrange(48)) % 48]
    if requirements.get('identifier_scope') == 'title_only':
        title = f"{requirements['authoritative_identifier']} {title}"
    return title


def context(doc, distribution=False):
    if distribution:
        return f"Title: {doc['title']}\nFormat: {doc['format']}\nDescription: {doc['description']}\n"
    return f"Title: {doc['title']}\nDescription: {doc['description']}\n"


def description(plan, seed, rng, site, columns):
    product = PRODUCTS[plan['product']][0]
    process = PROCESSES[plan['process']][0]
    requirements = plan.get('identifier_requirements', {})
    band_rng = rng_for(seed, plan['id'], 'length')
    band = band_rng.randrange(3)
    target = band_rng.randint(*((52, 70), (100, 130), (175, 210))[band])
    simulation = plan['constraints']['data_basis'] == 'simulation_only'
    opening = rng.choice((
        f'This deposit concerns {process} of {product} at {site}.',
        f'At {site}, the study covers {product} during {process}.',
        f'The {site} series documents {process}, focusing on {product}.',
        f'A separate investigation at {site} examines {product} through {process}.',
    ))
    if simulation:
        basis = 'All entries are computer simulations; no physical trial or empirical observations were collected.'
    elif 'contradicted_measurement' in plan['canonical_claims']['exclusion_flags']:
        basis = 'This is an observed commercial ledger associated with the activity, not a report of experimental performance.'
    else:
        basis = rng.choice(('Physical observations were recorded, not process simulations.',
                            'The described study uses empirical observations from physical samples.',
                            'Entries describe an observational study rather than model predictions.'))
    identity = ''
    if requirements.get('identifier_scope') == 'dataset_description':
        token = requirements['authoritative_identifier']
        identity = f' The catalogue model or edition is {token}.'
        aliases = requirements['aliases']
        if aliases:
            identity += ' Its declared catalogue aliases are ' + ' and '.join(aliases) + '.'
        if plan['product'] == 'shoe_component':
            part = 'sole assembly' if token.endswith('SOLE') else 'replacement lace'
            identity += f' This record documents the {part} component only, not the complete parent running shoe.'
    if simulation:
        evidence = 'The simulated output columns are '
    else:
        evidence = rng.choice(('Recorded columns comprise ', 'The released table lists ', 'Variables documented in the files are '))
    if band == 0:
        # Short descriptions leave the full measurement dictionary in every
        # searchable distribution, rather than deleting or abbreviating facts.
        evidence = ('The distribution synopses document the simulated columns and units.' if simulation else
                    'The distribution synopses document the measured columns and units.')
    else:
        evidence += '; '.join(columns) + '.'
    if plan['canonical_claims']['available_formats'] == ['PDF']:
        evidence += ' Only PDF tables are deposited; no machine-readable table is available.'
    paragraphs = [opening + identity, basis, evidence]
    rng.shuffle(paragraphs)
    # Independent per-record streams assign 1/3 to each band; target size is
    # selected before padding, and padding never adds target measurements.
    words = sum(len(p.split()) for p in paragraphs)
    additions = list(EDITORIAL)
    rng.shuffle(additions)
    short_notes = [
        'Rows retain local observation keys for reuse.',
        'The edition preserves the original row ordering.',
        'A field guide explains categorical entries and missing cells.',
        'Column headings follow the notation used by the depositor.',
        'The release is arranged for comparison within this study.',
        'Local row keys are not catalogue product identifiers.',
        'Readers should retain the supplied units when combining tables.',
        'The notes distinguish blanks from entries recorded as zero.',
        'The deposit contains no personal names or participant details.',
        'Each table uses the same local observation key.',
        'Supporting notes explain the conventions used in this edition.',
        'The institutional catalogue provides this synopsis for potential reuse.',
    ]
    rng.shuffle(short_notes)
    for paragraph in additions:
        if words >= target:
            break
        if words + len(paragraph.split()) > target + 3:
            paragraph = short_notes.pop()
        paragraphs.append(paragraph)
        words += len(paragraph.split())
    while words < target:
        paragraph = short_notes.pop()
        paragraphs.append(paragraph)
        words += len(paragraph.split())
    return ('\n\n' if rng.random() < .6 else ' ').join(paragraphs)


def make_record(plan, seed):
    rng = rng_for(seed, plan['id'])
    ordinal = int(plan['id'][1:]) - 1 + (100 if plan['id'].startswith('b') else 0)
    # A permutation of 200 fictional location pairs prevents two independent
    # studies from accidentally sharing their site in the same realization.
    location = (ordinal * 73 + rng_for(seed, 'locations').randrange(200)) % 200
    sector = ('East', 'West', 'North', 'South', 'Upper', 'Lower', 'Central', 'Outer', 'Inner', 'Coastal')
    site = SITES[location // 10] + ' ' + sector[location % 10]
    requirements = plan.get('identifier_requirements', {})
    identifier = requirements.get('authoritative_identifier', 'current edition')
    columns = [column_text(fact, rng, site, identifier) for fact in plan['facts']]
    rng.shuffle(columns)
    title = natural_title(plan, rng, site, seed)
    text = description(plan, seed, rng, site, columns)
    publisher_index = rng.randrange(len(PUBLISHERS))
    doc = {
        'identifier': plan['id'], 'title': title, 'description': text,
        'keywords': [PRODUCTS[plan['product']][1], PROCESSES[plan['process']][1]],
        'publisher': {'identifier': f'synthetic-institution-{publisher_index + 1:02}',
                      'name': PUBLISHERS[publisher_index]},
        'quality': 1, 'hasQuality': True, 'publishingState': 'published', 'tenantId': 0,
        'source': {'id': 'synthetic-benchmark', 'name': 'Locally authored synthetic benchmark metadata',
                   'url': 'https://synthetic.invalid/catalogue'},
        'distributions': [],
    }
    if rng.random() < .65:
        doc['issued'] = f'{rng.randint(2021, 2025)}-{rng.randint(1, 12):02}-01T00:00:00Z'
    if rng.random() < .65:
        doc['languages'] = ['en']
    if rng.random() < .65:
        doc['spatial'] = {'text': 'Fictional study location; no geographic preference'}
    if rng.random() < .65:
        doc['contactPoint'] = {'name': 'Synthetic institutional data desk',
                               'email': 'data@synthetic.invalid'}
    formats = list(plan['distribution_requirements']['required_formats'])
    # Existing required formats are never removed. A third child is another
    # slice in an already supported format, not an invented capability.
    if rng.random() < .55 and len(formats) < 3:
        formats.append(rng.choice(formats))
    for index, fmt in enumerate(formats, 1):
        dist_title = rng.choice(('Observation table', 'Deposited measurements', 'Study records',
                                 'Variable dictionary and values', 'Recorded series'))
        if requirements.get('identifier_scope') == 'distribution_only':
            dist_title += f" for {requirements['authoritative_identifier']}"
        simulation = plan['constraints']['data_basis'] == 'simulation_only'
        prefix = 'Simulated output columns: ' if simulation else 'Deposited columns: '
        dist_description = prefix + '; '.join(columns) + '.'
        if requirements.get('identifier_scope') == 'distribution_only':
            dist_description += f" The instrument model documented here is {requirements['authoritative_identifier']}."
        if fmt == 'PDF':
            dist_description += ' Tables are supplied inside a PDF document.'
        elif fmt == 'CSV':
            dist_description += ' Downloadable comma-separated table; the synopsis gives the column units.'
        else:
            dist_description += ' Downloadable JSON records with the same variables and units.'
        dist = {'identifier': f"{plan['id']}-distribution-{index}", 'title': dist_title,
                'description': dist_description, 'format': fmt,
                'mediaType': {'CSV': 'text/csv', 'JSON': 'application/json', 'PDF': 'application/pdf'}[fmt],
                'downloadURL': f"https://synthetic.invalid/{seed}/{plan['id']}/table-{index}.{fmt.lower()}",
                'tenantId': 0, 'publishingState': 'published'}
        if rng.random() < .65:
            dist['license'] = 'https://creativecommons.org/publicdomain/zero/1.0/'
        dist['queryContext'] = context(dist, True)
        doc['distributions'].append(dist)
    doc['queryContext'] = context(doc)
    return doc


def searchable_strings(doc):
    """All serialized string values, conservatively including optional fields."""
    if isinstance(doc, str):
        yield doc
    elif isinstance(doc, dict):
        for value in doc.values():
            yield from searchable_strings(value)
    elif isinstance(doc, list):
        for value in doc:
            yield from searchable_strings(value)


def self_check(documents, design):
    """Generator consistency only; never substitutes for independent C audit."""
    plans = {p['id']: p for p in design['record_plans']}
    assert len(documents) == len(plans) == 180
    assert {d['identifier'] for d in documents} == set(plans)
    assert len({d['title'] for d in documents}) == 180, 'duplicate titles'
    forbidden_keys = {'grade', 'intent_id', 'suite', 'canonical_claims', 'design_role', 'facts'}
    for doc in documents:
        plan = plans[doc['identifier']]
        assert not forbidden_keys.intersection(doc)
        assert doc['queryContext'] == context(doc)
        sentences = re.split(r'(?<=[.!?])\s+(?=[A-Z])', doc['description'])
        assert len(sentences) == len(set(sentences)), ('repeated sentence', doc['identifier'])
        assert doc['quality'] == 1 and doc['hasQuality'] is True
        strings = '\n'.join(searchable_strings(doc))
        for rule in plan['metadata_requirements'].get('prohibit_positive_tokens_for', []):
            for token in rule['tokens']:
                assert not re.search(r'(?i)(?<!\w)' + re.escape(token) + r'(?!\w)', strings), (plan['id'], token)
        formats = {d['format'] for d in doc['distributions']}
        assert formats == set(plan['canonical_claims']['available_formats'])
        for dist in doc['distributions']:
            assert dist['queryContext'] == context(dist, True)
        req = plan.get('identifier_requirements', {})
        if req.get('exact_title'):
            assert doc['title'] == req['exact_title']
        if req.get('identifier_scope') in ('distribution_only', 'title_only'):
            fields = req['forbidden_scope_if_' + req['identifier_scope']]
            token = req['authoritative_identifier']
            for field in fields:
                assert token not in '\n'.join(searchable_strings(doc.get(field, ''))), (plan['id'], token, field)
        # The selected column renderer must have supported every declared fact.
        for fact in plan['facts']:
            assert COLUMNS[fact][0] in strings, (plan['id'], fact)


PATCH_ARTIFACTS = {
    'fixture-patch-request-v3.json': 'd783f6f967d00c90163e8725ad72641e3205abcb6aee2d8247873ed4588f8f4d',
    'fixture-patch-request-v3-supplement.json': '3e47b0fd3c0a0482da5666f48244e92c7a9fb014b6a9780a0d6557831af296b8',
    'fixture-patch-approval-v3.json': 'ee9446a5dd159b5a82d4735c6a1bf4514f7a0ed59a084856c2a086737bfede42',
}


def patch_contract():
    patches = []
    for name, expected in PATCH_ARTIFACTS.items():
        path = ROOT / 'auditoutputs' / name
        if freeze.sha(path) != expected:
            raise ValueError('Approved v3 fixture patch artifact changed')
        patches.extend(json.loads(path.read_text()).get('patches', []))
    if len(patches) != 48 or len({(p['seed'], p['dataset_id']) for p in patches}) != 37:
        raise ValueError('Approved v3 fixture patch population differs')
    return patches


def field_changes(before, after, prefix=''):
    """Leaf-level diff; used to prove only approved fields/context changed."""
    if isinstance(before, dict) and isinstance(after, dict):
        if set(before) != set(after):
            raise ValueError('Patch changed the indexed field set')
        return [change for key in before for change in
                field_changes(before[key], after[key], f'{prefix}.{key}'.strip('.'))]
    if isinstance(before, list) and isinstance(after, list):
        if len(before) != len(after):
            raise ValueError('Patch changed distribution/metadata list length')
        return [change for i, (a, b) in enumerate(zip(before, after)) for change in
                field_changes(a, b, f'{prefix}.{i}')]
    return [] if before == after else [{'field': prefix, 'before': before, 'after': after}]


def apply_v3_patches(documents, seed):
    """Parent-approved exact 48-entry patch: no random-stream changes."""
    patches = [p for p in patch_contract() if p['seed'] == seed]
    corpus_hash = digest(jsonl_bytes(documents))
    original = {d['identifier']: json.loads(encoded(d)) for d in documents}
    byid = {d['identifier']: d for d in documents}
    allowed = collections.defaultdict(set)
    for patch in patches:
        identifier = patch['dataset_id']
        before, doc = original[identifier], byid[identifier]
        if corpus_hash != patch['before_corpus_sha256']:
            raise ValueError('v3 patch base corpus hash differs')
        if digest(encoded(before).rstrip(b'\n')) != patch['before_record_sha256']:
            raise ValueError('v3 patch base record hash differs: ' + identifier)
        evidence = patch['actual_evidence'][0]
        field, quote = evidence['field'], evidence['quote']
        if field.startswith('distributions.'):
            index = int(field.split('.')[1])
            child = doc['distributions'][index]
            if child['title'] != quote or quote not in ('Observation table', 'Deposited measurements'):
                raise ValueError('v3 simulation title condition failed')
            if 'All entries are computer simulations; no physical trial or empirical observations were collected.' not in doc['description']:
                raise ValueError('v3 simulation basis condition failed')
            child['title'] = 'Simulation output table'
            child['queryContext'] = context(child, True)
            allowed[identifier].update((field, f'distributions.{index}.queryContext'))
            continue
        if field != 'description' or quote not in before['description']:
            raise ValueError('v3 description condition failed: ' + identifier)
        text = doc['description']
        if quote == 'The described study uses empirical observations from physical samples.':
            text = text.replace(quote, 'These are observed administrative entries, not model predictions.', 1)
        elif identifier == 'a057':
            text = text.replace(quote, 'ornamental plants and their grounds-maintenance tools outside confectionery production areas', 1)
        else:
            # Replace only the original opening sentence, retaining site,
            # columns, basis, ordering and all unrelated editorial sentences.
            product = PRODUCTS['cacao_crop' if identifier == 'a005' else 'chocolate_dairy_beverage'][0]
            process = PROCESSES['postharvest_pest_storage' if identifier == 'a005' else 'ambient_transport_logistics'][0]
            opening = next(s for s in re.split(r'(?<=\.)\s+(?=[A-Z])', text)
                           if product in s and process in s)
            site_match = re.search(r'(?:at |The )((?:' + '|'.join(map(re.escape, SITES)) +
                                   r') (?:East|West|North|South|Upper|Lower|Central|Outer|Inner|Coastal))', opening)
            if site_match is None:
                raise ValueError('v3 opening site not found')
            site = site_match.group(1)
            if identifier == 'a005':
                replacement = (f'At {site}, postharvest pest inspection covers warehouse bags of harvested cacao material from the crop, '
                               'rather than treatment of living cacao trees in the field.')
            elif identifier == 'a076':
                replacement = (f'At {site}, ambient transport logistics concern sealed cartons of liquid chocolate-flavoured dairy milk beverage; '
                               'this is not a refrigerated shelf-life trial.')
            else:
                raise ValueError('Unapproved v3 description record')
            if text.count(opening) != 1:
                raise ValueError('v3 opening sentence not unique')
            text = text.replace(opening, replacement, 1)
        doc['description'] = text
        doc['queryContext'] = context(doc)
        allowed[identifier].update(('description', 'queryContext'))
    proof = []
    for doc in documents:
        identifier = doc['identifier']
        changes = field_changes(original[identifier], doc)
        if {c['field'] for c in changes} != allowed[identifier]:
            raise ValueError('v3 patch exceeds approved field scope: ' + identifier)
        proof.append({'seed': seed, 'dataset_id': identifier,
                      'before_record_sha256': digest(encoded(original[identifier]).rstrip(b'\n')),
                      'after_record_sha256': digest(encoded(doc).rstrip(b'\n')),
                      'row_bytes_identical': encoded(original[identifier]) == encoded(doc),
                      'field_changes': changes})
    return proof


V4_PATCH_ARTIFACTS = {
    'fixture-patch-request-v4.json': 'd40054c8ebc5d594ae21da199dd8711b9203d06458857bcc3d2d90a9d8c7e24a',
    'fixture-patch-approval-v4.json': '8c93dd5edb2931be37fc5fe5cf60a0f0fca3ddc3a48e99c9a849cc1a44d5154d',
}


def apply_v4_patches(documents, seed):
    artifacts = {}
    for name, sha in V4_PATCH_ARTIFACTS.items():
        path = ROOT / 'auditoutputs' / name
        if freeze.sha(path) != sha:
            raise ValueError('Approved v4 patch artifact changed')
        artifacts[name] = json.loads(path.read_text())
    request = artifacts['fixture-patch-request-v4.json']
    replacements = artifacts['fixture-patch-approval-v4.json']['approved_replacements']
    patches = [p for p in request['patches'] if p['seed'] == seed]
    corpus_hash = digest(jsonl_bytes(documents))
    before = {d['identifier']: json.loads(encoded(d)) for d in documents}
    allowed_ids = {p['dataset_id'] for p in patches}
    for patch in patches:
        doc = next(d for d in documents if d['identifier'] == patch['dataset_id'])
        if corpus_hash != patch['before_corpus_sha256'] or digest(encoded(doc).rstrip(b'\n')) != patch['before_record_sha256']:
            raise ValueError('v4 patch base corpus/record hash differs')
        if doc['title'] != patch['actual_evidence'][0]['quote']:
            raise ValueError('v4 patch title condition differs')
        if patch['actual_evidence'][1]['quote'] not in doc['description']:
            raise ValueError('v4 patch simulation basis differs')
        doc['title'] = replacements[doc['identifier']]
        doc['queryContext'] = context(doc)
    proof = []
    for doc in documents:
        identifier = doc['identifier']
        changes = field_changes(before[identifier], doc)
        expected = {'title', 'queryContext'} if identifier in allowed_ids else set()
        if {c['field'] for c in changes} != expected:
            raise ValueError('v4 patch exceeded title/context scope')
        proof.append({'seed': seed, 'dataset_id': identifier,
                      'before_record_sha256': digest(encoded(before[identifier]).rstrip(b'\n')),
                      'after_record_sha256': digest(encoded(doc).rstrip(b'\n')),
                      'row_bytes_identical': encoded(before[identifier]) == encoded(doc),
                      'field_changes': changes})
    return proof


def generate(seed, root=ROOT):
    design, _ = load_design(root)
    if seed not in design['seeds']:
        raise ValueError('Unregistered seed')
    documents = [make_record(plan, seed) for plan in design['record_plans']]
    apply_v3_patches(documents, seed)
    apply_v4_patches(documents, seed)
    self_check(documents, design)
    return documents


def expected_qrels(root=ROOT):
    design, queries = load_design(root)
    return [{'query_id': query['id'], 'dataset_id': plan['id'],
             'grade': design['intent_doc_grades'][query['intent_id']][plan['id']]}
            for query in queries for plan in design['record_plans']]


def summary(values):
    return {'min': min(values), 'mean': round(statistics.mean(values), 4),
            'median': statistics.median(values), 'max': max(values)}


def variation(corpora):
    stats = {}
    for seed, docs in corpora.items():
        lengths = [len(d['description'].split()) for d in docs]
        stats[str(seed)] = {
            'unique_titles': len({d['title'] for d in docs}),
            'title_words': summary([len(d['title'].split()) for d in docs]),
            'description_words': summary(lengths),
            'length_bands': {'45_75': sum(45 <= n <= 75 for n in lengths),
                             '90_140': sum(90 <= n <= 140 for n in lengths),
                             '160_220': sum(160 <= n <= 220 for n in lengths)},
            'distribution_counts': dict(collections.Counter(len(d['distributions']) for d in docs)),
            'publisher_count': len({d['publisher']['identifier'] for d in docs}),
            'repeated_description_sentences': sum(
                len(parts) - len(set(parts)) for parts in
                (re.split(r'(?<=[.!?])\s+(?=[A-Z])', d['description']) for d in docs)),
            'description_unique_tokens': summary([
                len(set(re.findall(r'\b\w+\b', d['description'].lower()))) for d in docs]),
        }
    pairs = {}
    for left, right in itertools.combinations(corpora, 2):
        ld, rd = corpora[left], corpora[right]
        jaccards = []
        for a, b in zip(ld, rd):
            at = set(re.findall(r'\b\w+\b', a['description'].lower()))
            bt = set(re.findall(r'\b\w+\b', b['description'].lower()))
            jaccards.append(len(at & bt) / len(at | bt))
        pairs[f'{left}:{right}'] = {
            'changed_titles': sum(a['title'] != b['title'] for a, b in zip(ld, rd)),
            'description_length_difference_ge10': sum(abs(len(a['description'].split()) - len(b['description'].split())) >= 10 for a, b in zip(ld, rd)),
            'changed_distribution_counts': sum(len(a['distributions']) != len(b['distributions']) for a, b in zip(ld, rd)),
            'description_token_jaccard': summary(jaccards),
        }
    stats['seed_pairs'] = pairs
    stats['any_pair_length_difference_ge10'] = sum(
        max(len(corpora[s][i]['description'].split()) for s in corpora) -
        min(len(corpora[s][i]['description'].split()) for s in corpora) >= 10 for i in range(180))
    stats['any_pair_changed_distribution_count'] = sum(
        len({len(corpora[s][i]['distributions']) for s in corpora}) > 1 for i in range(180))
    return stats


def immutable(path, content, verify_existing=False):
    path = Path(path)
    if path.is_symlink():
        raise ValueError(f'Refusing symlink output: {path}')
    if path.exists():
        if not verify_existing or path.read_bytes() != content:
            raise FileExistsError(f'Output exists or differs; never overwritten: {path}')
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('xb') as stream:
        stream.write(content)


def run(output_dir, root=ROOT, verify_existing=False, manifest_path=None, sample_path=None):
    root, output_dir = Path(root), Path(output_dir)
    frozen = freeze.verify(root)
    design, queries = load_design(root)
    corpora = {seed: generate(seed, root) for seed in design['seeds']}
    patch_proof = []
    v4_proof = []
    for seed in design['seeds']:
        base = [make_record(plan, seed) for plan in design['record_plans']]
        patch_proof.extend(apply_v3_patches(base, seed))
        actual_v3 = ROOT / f'.local/corpora-v3/seed-{seed}.jsonl'
        if actual_v3.exists() and actual_v3.read_bytes() != jsonl_bytes(base):
            raise ValueError('Preserved v3 actual rows differ from v4 patch base')
        v4_proof.extend(apply_v4_patches(base, seed))
        if jsonl_bytes(base) != jsonl_bytes(corpora[seed]):
            raise ValueError('Non-deterministic v3 patch result')
        previous_corpus = ROOT / f'.local/corpora-v2/seed-{seed}.jsonl'
        if previous_corpus.exists():
            unpatched = jsonl_bytes(make_record(plan, seed) for plan in design['record_plans'])
            if previous_corpus.read_bytes() != unpatched:
                raise ValueError('Preserved v2 actual row bytes differ from patch base')
    corpus_info = []
    for seed, documents in corpora.items():
        data = jsonl_bytes(documents)
        path = output_dir / f'seed-{seed}.jsonl'
        immutable(path, data, verify_existing)
        corpus_info.append({'seed': seed, 'path': str(path.resolve()), 'sha256': digest(data),
                            'bytes': len(data), 'records': len(documents)})
    qrels = jsonl_bytes(expected_qrels(root))
    qrels_path = root / 'qrels.jsonl'
    immutable(qrels_path, qrels, verify_existing)
    sample_ids = {'a001', 'a003', 'a029', 'a071', 'b001', 'b013', 'b027', 'b029'}
    sample = jsonl_bytes(d for d in corpora[design['seeds'][0]] if d['identifier'] in sample_ids)
    sample_path = Path(sample_path) if sample_path else root / 'fixtures/sample.jsonl'
    immutable(sample_path, sample, verify_existing)
    manifest_path = Path(manifest_path) if manifest_path else root / 'results/generation-manifest.json'
    codehash = freeze.sha(__file__)
    manifest = {
        'schema_version': 1, 'experiment_id': design['experiment_id'],
        'generated_at_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
        'frozen_at_utc': frozen['frozen_at_utc'], 'freeze_sha256': freeze.sha(root / 'spec-freeze.json'),
        'spec_sha256': frozen['spec_sha256'], 'generator_sha256': codehash, 'code_sha256': codehash,
        'freeze_tool_sha256': freeze.sha(root / 'freeze.py'),
        'record_plans': len(design['record_plans']), 'queries': len(queries),
        'intent_count': len(design['intent_doc_grades']), 'qrel_count': len(queries) * 180,
        'stable_ids_sha256': digest(json.dumps(sorted(p['id'] for p in design['record_plans']), separators=(',', ':')).encode()),
        'suite_counts': design['suite_counts'], 'suite_a_family_counts': design['suite_a_family_counts'],
        'corpora': corpus_info, 'qrels': {'path': str(qrels_path.resolve()), 'sha256': digest(qrels), 'rows': 13500},
        'sample': {'path': str(sample_path.resolve()), 'sha256': digest(sample), 'records': len(sample_ids)},
        'variation_statistics': variation(corpora),
        'realization_history': [],
        'realization_version': 4,
        'approved_patch_artifact_sha256': {**PATCH_ARTIFACTS, **V4_PATCH_ARTIFACTS},
        'v4_patch_proof': {
            'requested_entries': 2,
            'changed_record_count': sum(not p['row_bytes_identical'] for p in v4_proof),
            'unchanged_record_count': sum(p['row_bytes_identical'] for p in v4_proof),
            'records': v4_proof,
        },
        'v3_patch_proof': {
            'requested_entries': len(patch_contract()),
            'changed_record_count': sum(not p['row_bytes_identical'] for p in patch_proof),
            'unchanged_record_count': sum(p['row_bytes_identical'] for p in patch_proof),
            'row_hash_convention': 'SHA256 of exact compact sorted JSONL row bytes without terminal newline; equality also checks newline-inclusive bytes',
            'records': patch_proof,
        },
        'label_status': 'frozen expected design labels only; independent C validation REQUIRED before retrieval',
        'network_calls': 0, 'embedding_calls': 0, 'search_calls': 0,
        'quality': {'value': 1, 'hasQuality': True, 'stress_generation': 'not performed'},
        'overwrite_policy': 'exclusive create; --verify-existing accepts identical bytes only',
    }
    prior_path = root / '.local/corpora/generation-manifest-v1.json'
    if prior_path.exists():
        prior = json.loads(prior_path.read_text())
        for item in prior['corpora']:
            preserved = prior_path.parent / f"seed-{item['seed']}.jsonl"
            if freeze.sha(preserved) != item['sha256']:
                raise ValueError('Superseded corpus archive changed')
        manifest['realization_history'].append({
            'superseded_manifest_path': str(prior_path.resolve()),
            'superseded_manifest_sha256': freeze.sha(prior_path),
            'generated_at_utc': prior['generated_at_utc'],
            'generator_sha256': prior['generator_sha256'],
            'corpora': [{'seed': item['seed'], 'sha256': item['sha256'],
                         'preserved_path': str((prior_path.parent / f"seed-{item['seed']}.jsonl").resolve())}
                        for item in prior['corpora']],
            'reason': 'Pre-retrieval generator self-review: remove repeated padding sentences within records; use integer count examples. Frozen facts, criteria, identities and qrels unchanged.',
            'qrels_sha256_unchanged': prior['qrels']['sha256'] == digest(qrels),
        })
    v2_manifest_path = ROOT / '.local/corpora-v2/final-generation-manifest.json'
    if v2_manifest_path.exists():
        prior = json.loads(v2_manifest_path.read_text())
        manifest['realization_history'].append({
            'superseded_manifest_path': str(v2_manifest_path.resolve()),
            'superseded_manifest_sha256': freeze.sha(v2_manifest_path),
            'generated_at_utc': prior['generated_at_utc'],
            'generator_sha256': prior['generator_sha256'],
            'corpora': prior['corpora'],
            'reason': 'Parent-approved C fixture corrections limited to 48 repair entries over 37 records; other 503 rows byte-identical. Independent delta review required.',
            'qrels_sha256_unchanged': prior['qrels']['sha256'] == digest(qrels),
        })
    v3_manifest_path = ROOT / '.local/corpora-v3/final-generation-manifest.json'
    if v3_manifest_path.exists():
        prior = json.loads(v3_manifest_path.read_text())
        manifest['realization_history'].append({
            'superseded_manifest_path': str(v3_manifest_path.resolve()),
            'superseded_manifest_sha256': freeze.sha(v3_manifest_path),
            'generated_at_utc': prior['generated_at_utc'],
            'generator_sha256': prior['generator_sha256'],
            'corpora': prior['corpora'],
            'reason': 'Parent-approved two simulation root-title repairs only; 538 complete rows unchanged. Independent title delta review required.',
            'qrels_sha256_unchanged': prior['qrels']['sha256'] == digest(qrels),
        })
    if manifest_path.exists() and verify_existing:
        previous = json.loads(manifest_path.read_text())
        manifest['generated_at_utc'] = previous['generated_at_utc']
    immutable(manifest_path, (json.dumps(manifest, indent=2, sort_keys=True) + '\n').encode(), verify_existing)
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.local/corpora-v4')
    parser.add_argument('--root', type=Path, default=ROOT)
    parser.add_argument('--verify-existing', action='store_true')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--sample', type=Path)
    args = parser.parse_args()
    manifest = run(args.output_dir, args.root, args.verify_existing, args.manifest, args.sample)
    print(json.dumps({'corpora': manifest['corpora'], 'qrels': manifest['qrels'],
                      'label_status': manifest['label_status']}, indent=2))


if __name__ == '__main__':
    main()
