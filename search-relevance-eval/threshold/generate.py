#!/usr/bin/env python3
"""Offline first realization for #3887. Stage one only; no replica expansion.

This module produces planned synthetic fixtures, NOT independently validated truth.
No network, model, embedding, analyzer, engine, ranking, or backend code is called.
"""
import argparse
import copy
import datetime
import hashlib
import importlib.util
import json
from pathlib import Path
import random
import re
import sys

ROOT = Path(__file__).resolve().parent
EVAL = ROOT.parent
REPO = EVAL.parent
SEEDS = (38871, 38872, 38873)

def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

freeze = load_module("threshold_frozen_registration", ROOT / "freeze.py")
# Reuse only this pure function. Import has no execution side effects.
context = load_module("threshold_existing_projection", EVAL / "run.py").context

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf8")

def digest(data):
    return hashlib.sha256(data).hexdigest()

def file_sha(path):
    return digest(Path(path).read_bytes())

def rng(seed, identifier, stream="metadata"):
    return random.Random(int.from_bytes(hashlib.sha256(f"3887:{seed}:{identifier}:{stream}".encode()).digest(), "big"))

# Three authored discourse styles; immutable semantic scopes, no additional units,
# instruments, vehicle subtypes, locations or phenomena are introduced.
SCOPES = {
"observed_leak_detection": (
"Physical inspections of a municipal drinking-water pipe network document the detection of leaks in the potable supply.",
"This register concerns field observations made while locating leakage in a town's potable-water pipe system.",
"The collection follows observed breach tracing in municipal pipes that carry water intended for drinking."),
"observed_shade_microclimate": (
"Field observations describe the microclimate in shade beneath urban street trees, without attributing a causal effect to the trees.",
"This collection documents observed conditions under the shade of trees growing along city streets; it is not a causal comparison.",
"The records concern physical observations of shaded air beneath urban street trees, not estimates of a temperature reduction."),
"observed_repeated_cycle_aging": (
"Bench observations follow individual rechargeable battery cells intended for electric vehicles through aging during repeated charge and discharge.",
"This collection records physical tests of aging in individual electric-vehicle battery cells repeatedly charged and discharged, rather than whole packs.",
"Individual electrochemical cells for electric vehicles are observed as repeated recharging and discharging produces wear; no vehicle subtype is prescribed."),
"observed_nighttime_radar_tracking": (
"Radar radio echoes are used to observe migratory birds passing after dark; the entries describe actual passages rather than simulated flights.",
"This collection documents nighttime migration of birds observed using radar echoes, not tracking from tags or a flight simulation.",
"The observations follow migrating birds at night through radar returns. They represent physically observed movements, not generated flight paths."),
"observed_wheelchair_access_audit": (
"Field inspections audit wheelchair access at boarding points of public road bus stops, rather than stops for other transport modes.",
"The collection documents observed access surveys for wheelchair users at the places where passengers board public road buses.",
"Inspectors physically examine public road bus stop boarding points for wheelchair access; the entries are observations rather than design predictions."),
"observed_refrigerated_spoilage_testing": (
"Physical refrigerated-storage tests follow spoilage of fresh fish intended for people to eat, rather than live ornamental animals.",
"This collection documents observations of freshness loss during refrigerated holding of fresh fish for human consumption.",
"The records follow observed spoilage trials on fresh edible fish kept under refrigeration; they are not modeled shelf-life predictions."),
"observed_decolorization_treatment": (
"Physical treatment observations document removal of dye color from textile wastewater, rather than accounting for discharge permissions.",
"This collection follows observed treatment of fabric-dye wastewater to remove its coloration, not a simulation of the treatment.",
"The observations concern decolorization of wastewater from textile dyeing during actual treatment runs, rather than regulatory transactions."),
"observed_loaded_acoustic_testing": (
"Physical acoustic tests examine residential heat pump units while they operate under load, rather than a purchase register.",
"This collection documents observed noise testing of heat pumps used in homes while the appliances are operating under load.",
"The records follow acoustic testing of home heat pumping units in loaded operation; these are observations, not predicted noise maps."),
"observed_valve_replacement_inventory": (
"A physical inventory records replacement valves installed in municipal potable-water pipes. This is maintenance accounting, not leak detection.",
"The register concerns observed valve replacement in a town's drinking-water pipe network, rather than measurements from leakage investigations.",
"Installed replacement valves in municipal pipes carrying potable water are inventoried from observations, not from a leak-detection survey."),
"observed_pruning_operations": (
"Observed pruning work on urban street trees is recorded as an operations register, not as a shade microclimate survey.",
"This register documents physical pruning operations on city street trees; it does not describe observations beneath their shade.",
"The entries concern observed branch pruning along urban streets. They are tree maintenance records rather than a shaded-air study."),
"observed_manufacturing_sales_inventory": (
"Observed manufacturing sales of individual electric-vehicle battery cells are inventoried, rather than tested for aging through repeated cycling.",
"The register records actual manufacturing sales transactions for battery cells intended for electric vehicles, not repeated charging and discharging tests.",
"This inventory concerns sales of individual rechargeable cells for electric vehicles. It records transactions rather than observations of cell aging."),
"observed_daytime_acoustic_sightings": (
"Migratory birds are observed by their calls during daylight. These acoustic sightings are not nighttime radar tracking of flights.",
"This collection documents daytime listening observations of migrating birds, rather than after-dark movement observations from radar echoes.",
"The entries describe observed daytime acoustic sightings of migratory birds; the collection does not use radar to follow nighttime passages."),
"observed_route_timetable_inventory": (
"A checked timetable inventory describes scheduled public road bus routes at boarding stops, not a wheelchair access audit.",
"The collection records observed timetable information for public road bus stop boarding points, rather than physical access measurements for wheelchair users.",
"Public road bus boarding stops are represented through their checked route timetables. This is a schedule inventory, not a wheelchair survey."),
"observed_ambient_shipping_invoices": (
"Observed shipping invoices concern fresh fish for human consumption transported at ambient conditions, not refrigerated spoilage experiments.",
"The register records actual ambient-shipping transactions for fresh edible fish, rather than tests of freshness loss in refrigerated storage.",
"This collection inventories invoices for ambient shipment of fresh fish intended as food. The records are not refrigerated-storage spoilage observations."),
"observed_discharge_permit_accounting": (
"Observed discharge-permit accounts concern textile dye wastewater. They document administrative transactions, not treatment measurements for removing color.",
"The register records actual permit accounting for wastewater from textile dyeing, rather than observations of a decolorization process.",
"This collection concerns observed permit transactions for textile-dye wastewater discharge. It is an accounting register, not a color-removal experiment."),
"observed_purchase_cost_inventory": (
"Observed purchases of residential heat pump units are inventoried as procurement records, not acoustic tests of appliances under load.",
"This register records actual purchase transactions for home heat pumping units, rather than observations of sound during loaded operation.",
"The inventory concerns purchases of heat pumps for residential use. It documents observed orders, not loaded acoustic testing."),
"observed_instrument_tuning": (
"Physical tuning observations concern a musical pipe organ, not a municipal water network or leakage investigation.",
"This collection documents observed tuning of pipes in a musical organ; the instrument is not part of a water supply.",
"The register follows actual tuning observations for a pipe organ used as a musical instrument, rather than water-pipe inspection."),
"observed_parser_performance": (
"Observed parser runs process software syntax trees, not living street trees or measurements of shaded air.",
"This collection records actual software parser performance on syntax tree structures; it is not a study of urban vegetation.",
"The records concern measured performance of parsing software syntax trees. These computational trees are unrelated to street planting."),
"observed_museum_inventory": (
"A physical museum inventory describes a historical artillery battery, rather than electrochemical cells for electric vehicles.",
"This register documents observed museum holdings from an artillery battery. It concerns historical guns, not rechargeable electric-vehicle cells.",
"The collection records actual museum inventory observations of a historical gun battery; no battery-cell cycling is involved."),
"observed_retail_inventory": (
"A physical retail inventory concerns decorative bird figurines, not living migratory birds observed in flight.",
"The register documents observed shop inventory of ornamental bird figurines, rather than radar observations of migration.",
"This collection records actual retail holdings of decorative bird figures. They are objects for sale, not migrating animals."),
"observed_digital_signal_tests": (
"Physical digital-signal tests examine a computer bus, not passenger boarding points for public road transport.",
"This collection documents observed electronic signal tests on a computer bus; it is unrelated to public bus stop access.",
"The register follows actual signal testing of an electronic computer bus, rather than inspection of road passenger stops."),
"observed_aquarium_taxonomy": (
"Physical aquarium observations catalogue the taxonomy of live ornamental fish, not fresh fish intended for human consumption.",
"The register documents observed aquarium holdings of living ornamental fish, rather than refrigerated spoilage tests of edible fish.",
"This collection concerns actual taxonomy observations for ornamental live fish in aquaria. It is not a food-storage experiment."),
"observed_fabric_cataloging": (
"Physical cataloguing observations describe retail textile patterns, rather than treatment of wastewater from fabric dyeing.",
"The register documents observed retail fabric patterns, not textile-dye wastewater or a process to remove its color.",
"This collection concerns actual cataloguing of textile patterns offered at retail, rather than industrial wastewater treatment."),
"observed_sound_archive_cataloging": (
"Observed cataloguing describes recorded music in a sound archive, rather than acoustic testing of residential heat pumps.",
"The register documents actual music recordings held in a sound archive. These are not noise measurements from working home appliances.",
"This collection concerns physical archive cataloguing of recorded music, not sound tests on heat pumping units under load.")}

FACTS = {
"water_pressure": ("gauge water pressure", "measured water pressure", "water pressure recorded as pressure, not a head proxy"),
"flow_rate": ("volumetric flow rate", "rate of water delivery", "measured volumetric throughput"),
"confirmed_leak_location": ("verified leak positions", "confirmed positions of breaches", "locations where leakage was physically confirmed"),
"air_temperature": ("air temperature in tree shade", "ambient air thermal readings beneath the shade", "measured shaded-air temperature"),
"canopy_cover": ("overhead canopy coverage", "fraction of sky covered by tree crowns", "extent of overhead foliage cover"),
"per_reading_clock_time": ("an individual clock time attached to every temperature reading", "the time of day recorded separately for each air-temperature observation", "a row-associated clock timestamp for each individual thermal reading"),
"remaining_capacity": ("retained usable electrical capacity of each cell", "measured remaining usable electrical capacity", "the usable electrical capacity still retained by individual cells"),
"cycle_count": ("completed charge-discharge cycle count", "number of completed charging and discharging repetitions", "a tally of completed recharge-discharge cycles"),
"cell_temperature": ("cell temperature", "thermal readings of each cell", "measured temperature within the cells"),
"flight_height_above_local_ground": ("flight height above local ground", "height of flight referenced to the local terrain", "radar-derived elevation above the ground directly below, not sea-level altitude"),
"passage_count": ("number of passages", "a tally of birds passing", "observed passage counts"),
"per_passage_clock_time": ("an individual clock time for each observed radar passage", "the time of day attached to every individual radar passage", "a separate row-associated clock timestamp for each bird passage"),
"boarding_gap": ("gap between bus and boarding platform", "vehicle-to-platform separation", "measured boarding gap"),
"approach_slope": ("slope of the approach", "entry-path gradient", "incline along the boarding approach"),
"clear_width": ("unobstructed passage width", "clear breadth available for passage", "width remaining free of obstructions"),
"storage_temperature": ("storage temperature", "thermal conditions of refrigerated holding", "measured temperature during storage"),
"elapsed_storage_time": ("elapsed time since storage began", "duration of refrigerated holding", "time spent in storage"),
"bacterial_count": ("viable bacterial count", "enumerated bacteria", "counts of viable bacteria"),
"inlet_color_measurement": ("incoming wastewater color readings", "measured coloration at the inlet", "optical color values upstream of treatment"),
"outlet_color_measurement": ("outgoing wastewater color readings", "measured coloration at the outlet", "optical color values downstream of treatment"),
"electricity_consumption": ("electrical energy consumed over treatment", "integrated electricity use, not instantaneous power", "total electrical energy used during treatment"),
"sound_pressure_level_db": ("sound pressure level in decibels", "measured sound-pressure level expressed in dB", "decibel readings of sound pressure level, not acoustic intensity"),
"measurement_distance": ("distance from the unit to the microphone", "microphone-to-appliance separation", "measurement distance between source and microphone"),
"operating_load": ("operating load", "working output load", "duty demand during operation"),
"valve_count": ("number of valves", "valve totals", "counts of installed valves"),
"installation_date": ("installation dates", "dates of valve installation", "recorded installation dates"),
"branch_removal_count": ("removed branch counts", "number of branches removed", "totals of cut branches"),
"crew_hours": ("crew hours", "hours of crew work", "recorded work hours for the crew"),
"units_shipped": ("units shipped", "shipped-cell totals", "counts of units dispatched"),
"sale_price": ("sale prices", "prices charged on sale", "recorded selling prices"),
"daytime_call_count": ("daytime call counts", "calls heard during daylight", "a tally of daytime bird calls"),
"observer_position": ("observer positions", "locations of the listeners", "recorded observer positions"),
"scheduled_route_count": ("scheduled route counts", "number of listed routes", "totals of scheduled routes"),
"departure_time": ("scheduled departure times", "listed times of departure", "timetable departure times"),
"consignment_price": ("consignment prices", "prices for consignments", "recorded shipment charges"),
"invoice_date": ("invoice dates", "dates appearing on invoices", "recorded billing dates"),
"permit_fee": ("permit fees", "fees charged for permits", "recorded permission fees"),
"billing_period": ("billing periods", "periods covered by bills", "the accounting period for each bill"),
"purchase_price": ("purchase prices", "prices paid for units", "recorded procurement costs"),
"order_date": ("order dates", "dates of purchase orders", "recorded ordering dates"),
"musical_pitch": ("musical pitch", "tuned note pitches", "measured pitches of notes"),
"pipe_length": ("pipe lengths", "lengths of organ pipes", "measured organ-pipe lengths"),
"parse_duration": ("parse duration", "time required to parse", "elapsed parsing duration"),
"node_count": ("node counts", "number of syntax nodes", "counts of tree nodes"),
"gun_count": ("gun counts", "number of artillery pieces", "totals of guns"),
"accession_date": ("accession dates", "dates of accession", "recorded museum accession dates"),
"item_price": ("item prices", "selling prices of figures", "listed prices"),
"stock_count": ("stock counts", "numbers held in stock", "totals of stocked items"),
"signal_voltage": ("signal voltage", "measured voltage of signals", "voltage readings"),
"transfer_frequency": ("transfer frequency", "frequency of transfers", "measured transfer frequencies"),
"species_name": ("species names", "taxonomic species names", "recorded species identifications"),
"tank_count": ("tank counts", "number of tanks", "totals of aquarium tanks"),
"pattern_color": ("pattern colors", "colors of fabric patterns", "recorded pattern coloration"),
"retail_price": ("retail prices", "prices offered at retail", "listed retail prices"),
"recording_duration": ("recording durations", "lengths of music recordings", "playing durations"),
"performer_name": ("performer names", "names of performers", "credited performers")}

# Titles refer only to product/process, so they cannot leak nested measurements.
TITLES = {
"observed_leak_detection": ("Drinking-water leakage inspections", "Potable network breach tracing", "Municipal pipe leakage notes"),
"observed_shade_microclimate": ("Street-tree shade observations", "City tree shade fieldbook", "Shaded street-tree microclimate"),
"observed_repeated_cycle_aging": ("Electric-vehicle cell cycling observations", "Rechargeable cell wear register", "Vehicle battery cell aging trials"),
"observed_nighttime_radar_tracking": ("After-dark bird radar observations", "Migration radar field register", "Night bird passage observations"),
"observed_wheelchair_access_audit": ("Public bus wheelchair access survey", "Bus boarding access inspections", "Wheelchair access at road bus stops"),
"observed_refrigerated_spoilage_testing": ("Refrigerated edible fish spoilage trials", "Fresh fish storage observations", "Food fish refrigerated holding tests"),
"observed_decolorization_treatment": ("Textile wastewater color-removal observations", "Fabric effluent treatment register", "Dye wastewater treatment runs"),
"observed_loaded_acoustic_testing": ("Loaded home heat pump acoustic tests", "Residential appliance noise observations", "Working heat pump acoustic register"),
"observed_valve_replacement_inventory": ("Potable pipe valve replacements", "Drinking-water valve installation register", "Municipal valve maintenance inventory"),
"observed_pruning_operations": ("Street-tree pruning operations", "City tree pruning register", "Urban branch maintenance records"),
"observed_manufacturing_sales_inventory": ("Vehicle cell manufacturing sales", "Electric-vehicle cell dispatch register", "Battery cell sales inventory"),
"observed_daytime_acoustic_sightings": ("Daytime migration listening observations", "Migratory bird call register", "Daylight bird acoustic sightings"),
"observed_route_timetable_inventory": ("Public road bus stop timetables", "Bus route schedule inventory", "Road bus boarding-stop schedules"),
"observed_ambient_shipping_invoices": ("Ambient food-fish shipping invoices", "Edible fish consignment accounts", "Fresh fish ambient shipment register"),
"observed_discharge_permit_accounting": ("Textile effluent permit accounts", "Dye wastewater permission register", "Fabric wastewater discharge billing"),
"observed_purchase_cost_inventory": ("Home heat pump purchase register", "Residential heat pump procurement", "Heat pumping unit order inventory"),
"observed_instrument_tuning": ("Musical pipe organ tuning", "Organ pipe tuning fieldbook", "Pipe organ tuning observations"),
"observed_parser_performance": ("Syntax tree parser observations", "Software tree parsing register", "Parser performance fieldbook"),
"observed_museum_inventory": ("Artillery battery museum inventory", "Historical gun battery register", "Museum artillery holdings"),
"observed_retail_inventory": ("Decorative bird shop inventory", "Retail bird figurine register", "Ornamental bird figure stockbook"),
"observed_digital_signal_tests": ("Computer bus signal tests", "Electronic bus test register", "Digital bus signal observations"),
"observed_aquarium_taxonomy": ("Ornamental live fish taxonomy", "Aquarium fish holdings register", "Live ornamental fish catalogue"),
"observed_fabric_cataloging": ("Retail textile pattern catalogue", "Fabric pattern shop register", "Textile pattern inventory"),
"observed_sound_archive_cataloging": ("Recorded music sound archive", "Music recording catalogue", "Sound archive music register")}

# Domain-specific scope explanation. These concern interpretation of the SAME
# process, not extra instruments or unsupported substantive variables.
DOMAIN_CONTEXT = {
"observed_leak_detection": "The scope is the drinking supply itself. Entries belong to inspection work on the pipe network, so they should not be read as a catalogue of plumbing products. The description distinguishes the inspection collection from a general maintenance register.",
"observed_shade_microclimate": "The scope is the shaded setting associated with trees along streets. Tree presence identifies the setting of the observations; it does not establish what conditions would have been without shade. The collection therefore supports descriptive interpretation rather than a claimed causal comparison.",
"observed_repeated_cycle_aging": "The unit represented is an individual cell, not an assembled pack. Electric vehicles are the intended application without limiting the records to a particular vehicle class. The collection describes repeated use of those cells rather than manufacturing sales or shipment accounting.",
"observed_nighttime_radar_tracking": "The scope is migration after dark and the observation method is radar. The records should not be read as daytime listening sightings or as telemetry from tagged animals. A passage is an observed event within this collection, not an invented flight trajectory.",
"observed_wheelchair_access_audit": "The scope is the boarding point used by public road buses. Wheelchair access is the purpose of the inspection, rather than a general account of route services. The collection should not be read as an equivalent survey of tram, taxi or railway boarding.",
"observed_refrigerated_spoilage_testing": "The scope is edible fresh fish held under refrigeration for spoilage testing. The entries should not be interpreted as observations of aquarium animals or accounts of ambient shipment. Their subject is the stored food during the test, not the commercial transaction that supplied it.",
"observed_decolorization_treatment": "The scope is treatment of colored wastewater from textile dyeing. The entries concern the treatment itself, rather than permit billing or the sale of patterned cloth. A treatment record should not be interpreted as an account of a regulatory transaction or a retail product.",
"observed_loaded_acoustic_testing": "The scope is acoustic testing of residential units in loaded operation. The entries should not be interpreted as procurement orders or as music held in an archive. Operation identifies the test setting without turning the collection into a purchase or catalogue record."
}

# All generic text below is documentation of real metadata/file organization,
# not fabricated extra scientific claims. No minimum-length loop or padding.
ORDINARY_CONTEXT = (
"The dataset description defines the contents of the release; the attached files are two representations of that collection, not separate studies. Interpret the listed variables only as documented here. Fields not described are outside the published contents, and no additional measurements can be inferred from the collection name.",
"Use this description to interpret the published entries. The downloadable table and structured file represent the same collection rather than independent evidence. The release is limited to the contents stated here; its name does not imply that other measurements or related operational records are available in the files.",
"The published files carry the collection described here in tabular and structured form. They do not add a second study or extend the documented scope. Read the stated contents as the limits of this release, rather than inferring additional observations from a broad subject heading or from the publisher's name.")
TECHNICAL_ORGANIZATION = (
"The primary description establishes what collection the files belong to, while the first downloadable file describes its recorded contents. That separation is intentional: the collection heading alone is not a list of variables. The structured companion represents the same entries and does not add a further experiment. Interpret the file description together with this scope statement when deciding what the release contains.",
"Collection-level documentation and file-level documentation serve different purposes in this release. This description establishes the subject and observational setting; the first file's description specifies the recorded contents. The second format is a representation of the same collection rather than independent supporting evidence. Reading the collection heading as though it enumerated the available variables would therefore extend the release beyond what its documentation states.",
"The release keeps its collection scope here and its contents statement with the first downloadable file. Consult those two descriptions together: neither the short title nor the publisher's name is intended as a substitute for the file documentation. The companion format carries the same collection, not an additional study. This organization separates the account of what was observed from the account of what the published entries contain.")
FICTION = (
"Names, identifiers and catalogue entries are fictional examples, with no assertion of real-world collection provenance.",
"Names, identifiers and these catalogue entries are fictional examples, with no assertion of real-world collection provenance.",
"Names, identifiers and all these catalogue entries are fictional examples, with no assertion of real-world collection provenance.")
FILE_TEXT = (
"Downloadable representation of the collection documented by the dataset. The file provides the stated contents in this format; its alternate representation adds no independent observations or additional measurements.",
"This downloadable file represents the collection described at dataset level. Read that description for the contents and their limits; the companion format is not a separate study or source of further measurements.",
"A downloadable encoding of the documented collection. Its contents have the scope stated in the dataset description, and the alternate file format should not be interpreted as an additional set of observations.")
PUBLISHERS = ("Merefield Records Office", "Linden Quay Documentation Bureau", "Orrel Collection Service")


def enumerate_facts(claim, style):
    phrases = [FACTS[f][style] for f in claim["facts"]]
    if len(phrases) == 1:
        return phrases[0]
    return ", ".join(phrases[:-1]) + " and " + phrases[-1]


def add_projection(doc):
    doc["queryContext"] = context(doc)
    for child in doc["distributions"]:
        child["queryContext"] = context(child, True)
    return doc


def metadata(identifier, title, description, publisher, formats, style, first_description=None):
    children = []
    for n, fmt in enumerate(formats):
        children.append({"identifier": f"{identifier}-d{n+1}", "tenantId": 0,
                         "title": ("Tabular collection", "Structured collection")[n % 2],
                         "description": first_description if n == 0 and first_description else FILE_TEXT[style],
                         "format": fmt, "downloadURL": f"https://reserved.invalid/collections/{identifier}/file-{n+1}.{fmt.lower()}",
                         "publishingState": "published"})
    return add_projection({"identifier": identifier, "tenantId": 0, "title": title,
                          "catalog": None, "description": description, "publisher": {"name": publisher},
                          "keywords": [], "quality": 1.0, "hasQuality": True,
                          "publishingState": "published", "landingPage": f"https://reserved.invalid/collections/{identifier}",
                          "distributions": children})


def semantic_record(seed, plan, claim, growth=False):
    identifier = plan.get("id", plan.get("archetype_id"))
    # Fixed distinct style per registered seed; PRNG is independent per record.
    style = SEEDS.index(seed)
    r = rng(seed, identifier)
    process = claim["process"]
    scope = SCOPES[process][style]
    facts = enumerate_facts(claim, style)
    title_style = (style + r.randrange(3)) % 3
    title = TITLES[process][title_style]
    if growth:
        desc = f"{scope} Entries document {facts}. Filed by {{{{station}}}}. Metadata release: {{{{year}}}}, month {{{{month}}}}. {FICTION[style]}"
        publisher = f"{PUBLISHERS[style]}, {{{{station}}}}"
        return metadata("{{record_id}}", title, desc, publisher, ["CSV", "JSON"], style)
    budget = plan["prose_budget"]
    nested = plan["evidence_layout"] == "nested_measurements"
    if nested:
        desc = f"{scope} {DOMAIN_CONTEXT[process]} {TECHNICAL_ORGANIZATION[style]} {FICTION[style]}"
        first = (f"The entries record {facts}. This downloadable table documents the fictional physical observations described by the collection; its structured companion carries the same entries, without further measurement variables.")
    else:
        desc = f"{scope} Entries document {facts}. {FICTION[style]}"
        if budget == "ordinary":
            desc = f"{scope} Entries document {facts}. {ORDINARY_CONTEXT[style]} {FICTION[style]}"
        first = None
    publisher = PUBLISHERS[r.randrange(len(PUBLISHERS))]
    return metadata(identifier, title, desc, publisher, claim["available_formats"], style, first)


def exact_record(seed, plan, claim):
    style = SEEDS.index(seed)
    number = int(plan["id"][1:])
    if number in (49, 50):
        subject = ("an acoustic logger", "an acoustic logging instrument", "an instrument for acoustic logging")[style]
    elif number == 51:
        subject = ("a microphone component for an acoustic logger, not the parent unit", "a separate microphone module, not the acoustic logger itself", "an acoustic logger's microphone component rather than the complete instrument")[style]
    elif number in (52, 53, 54):
        subject = ("a harbour bathymetry survey release", "a release of a harbour bathymetry survey", "a published harbour bathymetry release")[style]
    elif number in (55, 56):
        subject = ("a ventilation fan component", "a component for a ventilation fan", "a separate ventilation fan part")[style]
    elif number == 57:
        subject = ("a ventilation seal kit, not a fan component", "a separate sealing kit for ventilation equipment", "a ventilation seal kit rather than a fan unit")[style]
    else:
        subject = ("a thermal meter", "a thermal measuring instrument", "a meter for thermal measurement")[style]
    statements = (
        f"This identity register documents {subject}. Its title and file documentation identify the registered item; similar-looking codes do not establish interchangeability. The downloadable table provides this register, not operating measurements. This is a fictional observed inventory, not simulated test results or a real-data claim.",
        f"The collection is an observed identity register for {subject}. Consult the title together with the attached file documentation for the item represented. The table concerns that identity alone and does not describe performance testing. All inventory observations are fictional; no real dataset or simulated experiment is asserted.",
        f"This register concerns the observed identity of {subject}. The release identifies the item through its title and attached documentation, rather than supplying a performance study. The downloadable table carries the register in one format. Its inventory observations are fictional, not simulations or claims about actual holdings.")
    title = claim.get("required_exact_title") or ("Ventilation Fan Component Register" if number == 55 else "Ventilation Fan Parts Register")
    doc = metadata(plan["id"], title, statements[style], PUBLISHERS[style], ["CSV"], style)
    if claim["identity_scope"].startswith("distribution_only"):
        child = doc["distributions"][0]
        child["title"] = f"{claim['identity']} component register"
        child["description"] = f"This downloadable identity table identifies {subject} by the code {claim['identity']}. It represents the fictional observed register described by the dataset, not a performance test or an assertion about real holdings."
        child.pop("queryContext")
        child["queryContext"] = context(child, True)
    return doc


def slot_bindings(value, pointer=""):
    result = []
    if isinstance(value, dict):
        for key, item in value.items():
            result.extend(slot_bindings(item, pointer + "/" + key.replace("~", "~0").replace("/", "~1")))
    elif isinstance(value, list):
        for i, item in enumerate(value):
            result.extend(slot_bindings(item, pointer + "/" + str(i)))
    elif isinstance(value, str):
        for slot in re.findall(r"\{\{([a-z_]+)\}\}", value):
            result.append({"json_pointer": pointer, "slot": slot})
    return result


def render_representative(bundle):
    """Only stage-one r001; substitute exact declared scalar positions, not prose callbacks."""
    doc = copy.deepcopy(bundle["metadata"])
    declared = bundle["slot_bindings"]
    if declared != slot_bindings(doc):
        raise ValueError("Missing/extra/reordered slot bindings")
    allowed = {
        "record_id": {"/identifier", "/landingPage", "/distributions/0/identifier", "/distributions/1/identifier", "/distributions/0/downloadURL", "/distributions/1/downloadURL"},
        "station": {"/publisher/name", "/description", "/queryContext"},
        "year": {"/description", "/queryContext"},
        "month": {"/description", "/queryContext"}}
    values = slot_values(bundle["archetype_id"], 1)
    paths = {}
    for binding in declared:
        slot, pointer = binding["slot"], binding["json_pointer"]
        if pointer not in allowed.get(slot, set()):
            raise ValueError("Undeclared or unsafe slot position")
        paths.setdefault(pointer, set()).add(slot)
    for pointer, names in paths.items():
        parts = pointer.split("/")[1:]
        parent = doc
        for key in parts[:-1]:
            parent = parent[int(key)] if isinstance(parent, list) else parent[key]
        key = int(parts[-1]) if isinstance(parent, list) else parts[-1]
        text = parent[key]
        if not isinstance(text, str):
            raise ValueError("Slot must occupy declared scalar string")
        parent[key] = re.sub(r"\{\{([a-z_]+)\}\}", lambda m: values[m[1]] if m[1] in names else (_ for _ in ()).throw(ValueError("Unbound slot")), text)
    if slot_bindings(doc):
        raise ValueError("Unexpanded placeholder")
    return doc


def slot_values(archetype, replica):
    if not 1 <= replica <= 97:
        raise ValueError("Replica outside frozen domain")
    return {"record_id": f"{archetype}-r{replica:03}", "station": f"Station {replica:03}",
            "year": str(2010 + ((replica - 1) % 16)), "month": str(1 + ((replica - 1) % 12))}


def terminal_document(bundles):
    return {"schema_version": 1, "stage": "stage_one_unvalidated_terminals",
            "serialization": "record sha256: canonical JSON sort_keys=true separators=(',',':') ensure_ascii=false UTF-8 without newline; JSONL is canonical record plus LF",
            "projection_contract": {"implementation": "run.context", "root": "Title: {title}\\nDescription: {description}\\n",
                                    "distribution": "Title: {title}\\nFormat: {format}\\nDescription: {description}\\n", "no_injection": True},
            "slot_definitions": {
                "record_id": {"type": "string", "formula": "archetype_id + '-r' + replica zero-padded to 3 digits", "placements": ["/identifier", "/landingPage", "/distributions/0/identifier", "/distributions/1/identifier", "/distributions/0/downloadURL", "/distributions/1/downloadURL"], "semantic_influence": False},
                "station": {"type": "formatted_integer_string", "format": "Station {replica:03}", "range": [1, 97], "placements": ["/publisher/name", "/description", "/queryContext"], "meaning": "synthetic provenance panel only"},
                "year": {"type": "integer_rendered_decimal_string", "formula": "2010 + ((replica-1) % 16)", "range": [2010, 2025], "placements": ["/description", "/queryContext"], "meaning": "metadata release year ONLY"},
                "month": {"type": "integer_rendered_decimal_string", "formula": "1 + ((replica-1) % 12)", "range": [1, 12], "placements": ["/description", "/queryContext"], "meaning": "metadata release month ONLY"}},
            "formats": ["CSV", "JSON"], "optional_fields_or_prose_callbacks": False,
            "bundles": bundles}


def check_metadata(doc, plan, claim, spec, growth=False):
    allowed = {"identifier", "tenantId", "title", "catalog", "description", "publisher", "keywords", "quality", "hasQuality", "publishingState", "landingPage", "distributions", "queryContext"}
    child_allowed = {"identifier", "tenantId", "title", "description", "format", "downloadURL", "publishingState", "queryContext"}
    if set(doc) != allowed or set(doc["publisher"]) != {"name"}:
        raise ValueError("Unexpected or missing source field")
    if doc["tenantId"] != 0 or doc["publishingState"] != "published" or doc["quality"] != 1.0 or doc["hasQuality"] is not True:
        raise ValueError("Non-neutral dataset")
    if doc["keywords"] != [] or doc["catalog"] is not None:
        raise ValueError("Unexpected keyword/catalog text")
    for child in doc["distributions"]:
        if set(child) != child_allowed or child["tenantId"] != 0 or child["publishingState"] != "published":
            raise ValueError("Non-neutral/unknown distribution")
        if child["queryContext"] != context({k: v for k, v in child.items() if k != "queryContext"}, True):
            raise ValueError("Wrong nested projection")
        lo, hi = spec["budgets"]["nested_description_words"].values()
        if not lo <= len(child["description"].split()) <= hi:
            raise ValueError(f"Nested word budget: {doc['identifier']} {len(child['description'].split())}")
    if doc["queryContext"] != context({k: v for k, v in doc.items() if k != "queryContext"}):
        raise ValueError("Wrong root projection")
    if [d["format"] for d in doc["distributions"]] != claim["available_formats"]:
        raise ValueError("Formats differ from frozen plan")
    budget = spec["budgets"]["growth_compact" if growth else plan["prose_budget"]]
    n = len(doc["description"].split())
    if not budget["min_words"] <= n <= budget["max_words"]:
        raise ValueError(f"Description budget: {doc['identifier']} {n} not {budget}")
    if len(doc["title"].split()) > spec["budgets"]["dataset_title_words_max"]:
        raise ValueError("Title too long")
    text = canonical(doc).decode().lower()
    for token in plan.get("absence_tokens_in_all_searchable_fields", []):
        if re.search(r"(?<!\w)" + re.escape(token) + r"(?!\w)", text):
            raise ValueError("Forbidden positive token: " + token)
    if claim.get("required_exact_title") is not None and doc["title"] != claim["required_exact_title"]:
        raise ValueError("Required title changed")
    identity = claim.get("identity")
    if identity and claim["identity_scope"].startswith("distribution_only"):
        primary = {k: v for k, v in doc.items() if k != "distributions"}
        if identity.lower() in canonical(primary).decode().lower():
            raise ValueError("Distribution identity leaked to root")
    if identity and claim["identity_scope"] == "title_only_primary_fields":
        remainder = {k: v for k, v in doc.items() if k not in ("title", "queryContext")}
        if identity.lower() in canonical(remainder).decode().lower():
            raise ValueError("Title identity leaked")
    # This is structural QA only. No semantic grade is asserted here.


def realize(spec):
    corpora, representatives, bundles = {}, {}, []
    for seed in SEEDS:
        core = []
        for plan in spec["core_record_plans"]:
            claim = spec["canonical_claim_sets"][plan["claim_set"]]
            record = exact_record(seed, plan, claim) if plan["evidence_layout"] == "exact_scope" else semantic_record(seed, plan, claim)
            check_metadata(record, plan, claim, spec)
            core.append(record)
        growth = []
        for plan in spec["growth"]["archetypes"]:
            claim = spec["canonical_claim_sets"][plan["claim_set"]]
            terminal = semantic_record(seed, plan, claim, True)
            bundle = {"seed": seed, "archetype_id": plan["archetype_id"], "claim_set": plan["claim_set"],
                      "slot_bindings": slot_bindings(terminal), "metadata": terminal}
            bundles.append(bundle)
            record = render_representative(bundle)
            check_metadata(record, plan, claim, spec, True)
            growth.append(record)
        corpora[seed], representatives[seed] = core, growth
    return corpora, representatives, terminal_document(bundles)


def source_hashes():
    paths = [ROOT / "generate.py", ROOT / "test_generate.py", ROOT / "generation-notes.md", EVAL / "run.py", ROOT / "freeze.py",
             REPO / "magda-scala-common/src/main/scala/au/csiro/data61/magda/model/Misc.scala",
             REPO / "magda-indexer/src/main/scala/au/csiro/data61/magda/indexer/search/elasticsearch/ElasticSearchIndexer.scala"]
    return {str(p.relative_to(REPO)): file_sha(p) for p in paths}


def artifact_bytes(corpora, representatives, terminals):
    files = {"terminal-templates.json": json.dumps(terminals, ensure_ascii=False, sort_keys=True, indent=2).encode() + b"\n"}
    for seed in SEEDS:
        files[f"core-{seed}.jsonl"] = b"".join(canonical(r) + b"\n" for r in corpora[seed])
        files[f"growth-{seed}.jsonl"] = b"".join(canonical(r) + b"\n" for r in representatives[seed])
    return files


def verify_existing(output, files, registration):
    manifest = json.loads((output / "manifest.json").read_text())
    if manifest["stage"] != "stage_one" or manifest["spec_freeze_sha256"] != file_sha(ROOT / "spec-freeze.json"):
        raise ValueError("Existing realization has another registration")
    if manifest["source_sha256"] != source_hashes():
        raise ValueError("Source changed: retain existing realization; explicit repair/audit required")
    for name, data in files.items():
        if (output / name).read_bytes() != data or manifest["artifact_sha256"][name] != digest(data):
            raise ValueError("Existing artifact mismatch; never overwrite: " + name)
    records = {str(seed): {r["identifier"]: digest(canonical(r)) for name in (f"core-{seed}.jsonl", f"growth-{seed}.jsonl") for r in [json.loads(line) for line in files[name].splitlines()]} for seed in SEEDS}
    raw_records = {str(seed): {json.loads(line)["identifier"]: digest(line) for name in (f"core-{seed}.jsonl", f"growth-{seed}.jsonl") for line in files[name].splitlines(keepends=True)} for seed in SEEDS}
    if records != manifest["canonical_record_sha256"] or raw_records != manifest["raw_record_sha256"] or manifest["spec_sha256"] != registration["spec_sha256"]:
        raise ValueError("Record/spec hashes mismatch")
    return manifest


def stage_one(output, verify_only=False):
    registration = freeze.verify(ROOT)
    spec = json.loads((ROOT / "generation-spec.json").read_text())
    corpora, representatives, terminals = realize(spec)
    files = artifact_bytes(corpora, representatives, terminals)
    output = Path(output).resolve()
    if (output / "manifest.json").exists():
        return verify_existing(output, files, registration)
    if verify_only:
        raise ValueError("No existing stage-one manifest to verify")
    # Check every destination BEFORE creating anything; exclusive creation also
    # protects races. Incomplete/rejected first realizations are never overwritten.
    if output.exists() and any(output.iterdir()):
        raise ValueError("Nonempty output without manifest: retain for inspection")
    output.mkdir(parents=True, exist_ok=True)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    hashes = {name: digest(data) for name, data in files.items()}
    def source_path(name):
        path = output / name
        return str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else str(path)
    manifest = {"schema_version": 1, "stage": "stage_one", "created_utc": now,
                "status": "generated_requires_independent_actual_text_audit", "actual_text_validation_passed": False,
                "spec_freeze_sha256": file_sha(ROOT / "spec-freeze.json"), "spec_sha256": registration["spec_sha256"],
                "public_preregistration_commit": "56aa147db", "source_sha256": source_hashes(),
                "corpora": [{"seed": s, "path": source_path(f"core-{s}.jsonl"), "sha256": hashes[f"core-{s}.jsonl"], "record_count": 60} for s in SEEDS],
                "templates": [{"seed": s, "path": source_path(f"growth-{s}.jsonl"), "sha256": hashes[f"growth-{s}.jsonl"], "record_count": 20} for s in SEEDS],
                "terminal_templates": {"path": source_path("terminal-templates.json"), "sha256": hashes["terminal-templates.json"], "bundle_count": 60},
                "artifact_sha256": hashes,
                "canonical_record_sha256": {str(s): {r["identifier"]: digest(canonical(r)) for r in corpora[s] + representatives[s]} for s in SEEDS},
                "raw_record_sha256": {str(s): {json.loads(line)["identifier"]: digest(line) for name in (f"core-{s}.jsonl", f"growth-{s}.jsonl") for line in files[name].splitlines(keepends=True)} for s in SEEDS},
                "record_hash_conventions": {"raw_record_sha256": "SHA256 exact raw JSONL row bytes INCLUDING trailing LF", "canonical_record_sha256": "SHA256 canonical JSON sort_keys=True,separators=(',',':'),ensure_ascii=False UTF8 NO newline", "file_sha256": "SHA256 exact full file bytes", "path_base": "Paths relative to threshold directory; absolute paths only for explicit alternate test outputs"},
                "attestations": {"no_search": True, "no_embedding": True, "no_analyzer": True, "no_native_comparisons": True,
                                 "no_model_calls": True, "no_old_rank_results": True, "no_existing_corpora_or_U_modified": True,
                                 "no_production_writes": True, "stage_two_expanded": False,
                                 "planned_labels_not_independently_validated": True},
                "stage_two": "Not implemented; no expansion authorized. Independent actual-text C approval plus parent approval and accepted terminal SHA required in a separate later change."}
    for name, data in files.items():
        with (output / name).open("xb") as stream:
            stream.write(data)
    with (output / "manifest.json").open("xb") as stream:
        stream.write(json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False).encode() + b"\n")
    return verify_existing(output, files, registration)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".local/stage-one")
    parser.add_argument("--verify-existing", action="store_true", help="Require existing manifest and exact first-realization bytes; never rewrite")
    args = parser.parse_args(argv)
    result = stage_one(args.output, args.verify_existing)
    print(json.dumps({"status": result["status"], "stage": result["stage"], "records": 240,
                      "terminal_sha256": result["terminal_templates"]["sha256"], "manifest_sha256": file_sha(args.output / "manifest.json")}, sort_keys=True))

if __name__ == "__main__":
    main()
