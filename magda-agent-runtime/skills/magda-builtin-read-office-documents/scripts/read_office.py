#!/usr/bin/env python3
"""Extract the readable contents of DOCX, PPTX and XLSX files.

Read-only and standard-library only: no third-party package, LibreOffice or
network access is needed. Each extracted item carries a location label
(paragraph, table cell, slide, sheet cell) so answers can cite it.

The format is identified from the file's bytes, never from its extension.
Legacy binary (.doc/.xls/.ppt), password-protected, OpenDocument and other
formats are reported as unsupported rather than guessed at.
"""

import argparse
import datetime
import json
import os
import posixpath
import re
import sys
import zipfile
import xml.etree.ElementTree as ET

MiB = 1024 * 1024
DEFAULT_MAX_INPUT_BYTES = 200 * MiB
DEFAULT_MAX_PART_BYTES = 200 * MiB
DEFAULT_MAX_TOTAL_BYTES = 1024 * MiB
DEFAULT_MAX_CHARS = 100_000
DEFAULT_MAX_ROWS = 500
DEFAULT_MAX_COLS = 50
MAX_COMPRESSION_RATIO = 200
CELL_TEXT_LIMIT = 2_000

ZIP_MAGIC = b"PK\x03\x04"
CFB_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
REL_TYPE_SUFFIX = {
    "officeDocument": "/officeDocument",
    "header": "/header",
    "footer": "/footer",
    "footnotes": "/footnotes",
    "endnotes": "/endnotes",
    "comments": "/comments",
    "styles": "/styles",
    "numbering": "/numbering",
    "slide": "/slide",
    "notesSlide": "/notesSlide",
    "chart": "/chart",
    "diagramData": "/diagramData",
    "worksheet": "/worksheet",
    "chartsheet": "/chartsheet",
    "sharedStrings": "/sharedStrings",
    "drawing": "/drawing",
    "hyperlink": "/hyperlink",
    "vbaProject": "/vbaProject",
    "oleObject": "/oleObject",
    "externalLink": "/externalLink",
}
MAIN_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml": ("docx", "DOCX"),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.template.main+xml": ("docx", "DOTX template"),
    "application/vnd.ms-word.document.macroEnabled.main+xml": ("docx", "DOCM (macro-enabled)"),
    "application/vnd.ms-word.template.macroEnabledTemplate.main+xml": ("docx", "DOTM (macro-enabled template)"),
    "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml": ("pptx", "PPTX"),
    "application/vnd.openxmlformats-officedocument.presentationml.slideshow.main+xml": ("pptx", "PPSX slide show"),
    "application/vnd.openxmlformats-officedocument.presentationml.template.main+xml": ("pptx", "POTX template"),
    "application/vnd.ms-powerpoint.presentation.macroEnabled.main+xml": ("pptx", "PPTM (macro-enabled)"),
    "application/vnd.ms-powerpoint.slideshow.macroEnabled.main+xml": ("pptx", "PPSM (macro-enabled slide show)"),
    "application/vnd.ms-powerpoint.template.macroEnabled.main+xml": ("pptx", "POTM (macro-enabled template)"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml": ("xlsx", "XLSX"),
    "application/vnd.openxmlformats-officedocument.spreadsheetml.template.main+xml": ("xlsx", "XLTX template"),
    "application/vnd.ms-excel.sheet.macroEnabled.main+xml": ("xlsx", "XLSM (macro-enabled)"),
    "application/vnd.ms-excel.template.macroEnabled.main+xml": ("xlsx", "XLTM (macro-enabled template)"),
}


EXTENSIONS = {
    "docx": {"docx", "docm", "dotx", "dotm"},
    "pptx": {"pptx", "pptm", "ppsx", "ppsm", "potx", "potm"},
    "xlsx": {"xlsx", "xlsm", "xltx", "xltm"},
}


class Unsupported(Exception):
    """The input is not a readable OOXML document; the message says why."""


class Limits:
    def __init__(self, args):
        self.max_input_bytes = args.max_input_bytes
        self.max_part_bytes = args.max_part_bytes
        self.max_total_bytes = args.max_total_bytes
        self.max_rows = args.max_rows
        self.max_cols = args.max_cols


# ---------------------------------------------------------------- XML helpers


def local(tag):
    """Local name of an element or attribute; Transitional and Strict share them."""
    return tag.rsplit("}", 1)[-1] if isinstance(tag, str) else ""


def attr(el, name, default=None):
    """Attribute by local name, whatever its namespace."""
    if name in el.attrib:
        return el.attrib[name]
    for key, value in el.attrib.items():
        if local(key) == name:
            return value
    return default


def rel_id(el, name="id"):
    """A relationship-namespace attribute such as r:id or r:embed."""
    for key, value in el.attrib.items():
        if key.startswith("{") and local(key) == name and "relationships" in key:
            return value
    return None


def children(el, name):
    return [child for child in el if local(child.tag) == name]


def child(el, name):
    for item in el:
        if local(item.tag) == name:
            return item
    return None


def first(*elements):
    """First element that is not None; ElementTree elements without children are falsy."""
    for element in elements:
        if element is not None:
            return element
    return None


def descendants(el, name):
    return [item for item in el.iter() if local(item.tag) == name]


def on_off(el, name, default=False):
    """Read an OOXML boolean such as w:b or show="0"."""
    value = attr(el, name)
    if value is None:
        return default
    return value.lower() not in ("0", "false", "off")


def clean(text):
    return re.sub(r"[ \t\r\f\v]+", " ", text).strip()


def cell_text(text):
    text = clean(text.replace("\n", " / "))
    if len(text) > CELL_TEXT_LIMIT:
        text = text[:CELL_TEXT_LIMIT] + " …[cell truncated]"
    return text.replace("|", "\\|")


# ------------------------------------------------------------- Package access


class Package:
    """Bounded, read-only access to an OOXML ZIP package."""

    def __init__(self, path, handle, limits):
        self.path = path
        self.limits = limits
        self.read_total = 0
        self.warnings = []
        try:
            self.zip = zipfile.ZipFile(handle)
        except zipfile.BadZipFile as error:
            raise Unsupported(f"corrupt or truncated ZIP container ({error})")
        self.infos = {}
        for info in self.zip.infolist():
            name = info.filename.lstrip("/")
            if name in self.infos:
                raise Unsupported(f"duplicate package part {name!r}")
            self.infos[name] = info
        encrypted = [name for name, info in self.infos.items() if info.flag_bits & 0x1]
        if encrypted:
            raise Unsupported(
                f"ZIP-level encryption on {len(encrypted)} package part(s) (e.g. {encrypted[0]}); "
                "the contents cannot be read without the password"
            )
        if "[Content_Types].xml" not in self.infos:
            if "mimetype" in self.infos:
                mimetype = self.zip.read(self.infos["mimetype"])[:200].decode("ascii", "replace")
                raise Unsupported(f"OpenDocument file ({mimetype}); only OOXML (DOCX/PPTX/XLSX) is supported")
            raise Unsupported("ZIP file without [Content_Types].xml; not an Office Open XML document")
        self.rels_cache = {}

    def has(self, name):
        return name in self.infos

    def read(self, name):
        info = self.infos.get(name)
        if info is None:
            raise KeyError(name)
        self.check_size(name, info)
        try:
            return self.zip.read(info)
        except (zipfile.BadZipFile, EOFError, OSError, NotImplementedError) as error:
            raise Unsupported(f"cannot read package part {name}: {error}")

    def check_size(self, name, info):
        if info.file_size > self.limits.max_part_bytes:
            raise Unsupported(
                f"package part {name} expands to {info.file_size} bytes, above the "
                f"{self.limits.max_part_bytes}-byte per-part limit (--max-part-bytes)"
            )
        if info.compress_size and info.file_size / info.compress_size > MAX_COMPRESSION_RATIO and info.file_size > 10 * MiB:
            raise Unsupported(f"package part {name} has a suspicious compression ratio; refusing to expand it")
        self.read_total += info.file_size
        if self.read_total > self.limits.max_total_bytes:
            raise Unsupported(
                f"expanded package exceeds the {self.limits.max_total_bytes}-byte total limit (--max-total-bytes)"
            )

    def stream(self, name):
        """Open a part for incremental parsing, with read()'s limits and DTD check."""
        info = self.infos.get(name)
        if info is None:
            raise KeyError(name)
        self.check_size(name, info)
        try:
            with self.zip.open(info) as handle:
                head = handle.read(4096)
            if b"<!DOCTYPE" in head or b"<!ENTITY" in head:
                raise Unsupported(f"package part {name} declares a DTD, which OOXML never uses; refusing to parse it")
            return self.zip.open(info)
        except (zipfile.BadZipFile, EOFError, OSError, NotImplementedError) as error:
            raise Unsupported(f"cannot read package part {name}: {error}")

    def xml(self, name):
        data = self.read(name)
        head = data[:4096]
        if b"<!DOCTYPE" in head or b"<!ENTITY" in head:
            raise Unsupported(f"package part {name} declares a DTD, which OOXML never uses; refusing to parse it")
        try:
            return ET.fromstring(data)
        except ET.ParseError as error:
            raise Unsupported(f"malformed XML in {name}: {error}")

    def optional_xml(self, name):
        if name is None or not self.has(name):
            return None
        try:
            return self.xml(name)
        except Unsupported as error:
            self.warnings.append(str(error))
            return None

    def rels(self, part):
        """Relationships of a part: {id: (type, target_part_or_url, external)}."""
        if part in self.rels_cache:
            return self.rels_cache[part]
        folder, base = posixpath.split(part)
        rels_name = posixpath.join(folder, "_rels", base + ".rels")
        result = {}
        root = self.optional_xml(rels_name)
        if root is not None:
            for rel in children(root, "Relationship"):
                target = attr(rel, "Target", "")
                external = attr(rel, "TargetMode", "") == "External"
                if not external:
                    if target.startswith("/"):
                        target = target.lstrip("/")
                    else:
                        target = posixpath.normpath(posixpath.join(folder, target))
                result[attr(rel, "Id")] = (attr(rel, "Type", ""), target, external)
        self.rels_cache[part] = result
        return result

    def rels_of_type(self, part, kind):
        suffix = REL_TYPE_SUFFIX[kind]
        return [
            (rid, target)
            for rid, (rtype, target, external) in self.rels(part).items()
            if rtype.endswith(suffix) and not external
        ]

    def main_part(self):
        for rid, target in self.rels_of_type("", "officeDocument"):
            return target
        raise Unsupported("package has no main officeDocument relationship")

    def content_type(self, part):
        root = self.xml("[Content_Types].xml")
        for override in children(root, "Override"):
            if attr(override, "PartName", "").lstrip("/") == part:
                return attr(override, "ContentType", "")
        ext = part.rsplit(".", 1)[-1].lower()
        for default in children(root, "Default"):
            if attr(default, "Extension", "").lower() == ext:
                return attr(default, "ContentType", "")
        return ""


# --------------------------------------------------------------- Identify


def cfb_kind(data):
    """Classify an OLE2 Compound File by its directory entry names."""

    def has(name):
        return name.encode("utf-16-le") in data

    if has("EncryptionInfo") and has("EncryptedPackage"):
        return "ENCRYPTED"
    if has("WordDocument"):
        return "legacy Word 97-2003 binary document (.doc)"
    if has("Workbook") or has("Book"):
        return "legacy Excel 97-2003 binary workbook (.xls)"
    if has("PowerPoint Document"):
        return "legacy PowerPoint 97-2003 binary presentation (.ppt)"
    if has("__substg1.0_"):
        return "Outlook message (.msg)"
    return "OLE2 compound file of an unrecognised type"


def identify(path, handle, limits):
    """Classify an open file from its bytes; only OOXML packages are returned."""
    data = handle.read(4096)
    if data.startswith(CFB_MAGIC):
        # Directory entry names can sit anywhere in a compound file.
        kind = cfb_kind(data + handle.read())
        if kind == "ENCRYPTED":
            raise Unsupported(
                "password-protected (encrypted) Office document; its contents cannot be read without the "
                "password. Ask the user for an unprotected copy"
            )
        raise Unsupported(
            kind + ". Only DOCX, PPTX and XLSX (Office Open XML) are supported; a legacy file can be read "
            "only after someone saves it in the modern format"
        )
    if not data.startswith(ZIP_MAGIC):
        if data[:5] == b"%PDF-":
            raise Unsupported("PDF document, not an Office Open XML file")
        if data[:5] == b"{\\rtf":
            raise Unsupported("RTF document, not an Office Open XML file")
        if data[:5] == b"<?xml" and b"schemas-microsoft-com:office" in data[:4096]:
            raise Unsupported("Office 2003 XML (flat XML) file, not an Office Open XML package")
        raise Unsupported("not a ZIP-based Office Open XML file (unrecognised leading bytes)")
    handle.seek(0)
    package = Package(path, handle, limits)
    main = package.main_part()
    content_type = package.content_type(main)
    if content_type not in MAIN_TYPES:
        raise Unsupported(f"unsupported main document type {content_type or 'unknown'} in {main}")
    kind, label = MAIN_TYPES[content_type]
    return package, main, kind, label


# ------------------------------------------------------------------ Output


class Output:
    def __init__(self, max_chars):
        self.max_chars = max_chars
        self.parts = []
        self.size = 0
        self.truncated = False

    def line(self, text=""):
        if self.truncated:
            return
        text = str(text)
        if self.max_chars and self.size + len(text) + 1 > self.max_chars:
            room = max(0, self.max_chars - self.size)
            self.parts.append(text[:room])
            self.truncated = True
            return
        self.parts.append(text)
        self.size += len(text) + 1

    def text(self):
        return "\n".join(self.parts)


def table_rows(rows, out, indent=""):
    """Write a list of rows (lists of strings) as a Markdown table."""
    if not rows:
        out.line(indent + "(empty table)")
        return
    width = max(len(row) for row in rows)
    rows = [row + [""] * (width - len(row)) for row in rows]
    out.line(indent + "| " + " | ".join(rows[0]) + " |")
    out.line(indent + "|" + "---|" * width)
    for row in rows[1:]:
        out.line(indent + "| " + " | ".join(row) + " |")


# -------------------------------------------------------------------- DOCX


class Docx:
    def __init__(self, package, main):
        self.package = package
        self.main = main
        self.notes = {"footnote": {}, "endnote": {}}
        self.comments = {}
        self.style_names = {}
        self.style_numbering = {}
        self.numbering = {}
        self.has_tracked_changes = False
        self.drawings = 0
        self.paragraphs = 0
        self.tables = 0
        self.load_styles()

    def related(self, kind):
        found = self.package.rels_of_type(self.main, kind)
        return found[0][1] if found else None

    def load_styles(self):
        root = self.package.optional_xml(self.related("styles"))
        if root is None:
            return
        for style in children(root, "style"):
            name = child(style, "name")
            if name is not None:
                self.style_names[attr(style, "styleId")] = attr(name, "val", "")
            props = child(style, "pPr")
            num = child(props, "numPr") if props is not None else None
            if num is not None:
                self.style_numbering[attr(style, "styleId")] = num
        numbering = self.package.optional_xml(self.related("numbering"))
        if numbering is None:
            return
        abstract = {}
        for item in children(numbering, "abstractNum"):
            levels = {}
            for level in children(item, "lvl"):
                fmt = child(level, "numFmt")
                levels[attr(level, "ilvl")] = attr(fmt, "val", "") if fmt is not None else ""
            abstract[attr(item, "abstractNumId")] = levels
        for num in children(numbering, "num"):
            ref = child(num, "abstractNumId")
            if ref is not None:
                self.numbering[attr(num, "numId")] = abstract.get(attr(ref, "val"), {})

    def run_text(self, el, parts):
        """Append visible text below el in document order."""
        for item in el:
            name = local(item.tag)
            if name == "t":
                parts.append(item.text or "")
            elif name == "tab":
                parts.append("\t")
            elif name in ("br", "cr"):
                parts.append("\n")
            elif name == "noBreakHyphen":
                parts.append("-")
            elif name in ("delText", "instrText", "delInstrText"):
                continue
            elif name == "del":
                self.has_tracked_changes = True
                continue
            elif name == "ins":
                self.has_tracked_changes = True
                self.run_text(item, parts)
            elif name == "footnoteReference":
                parts.append(f"[^fn{attr(item, 'id')}]")
            elif name == "endnoteReference":
                parts.append(f"[^en{attr(item, 'id')}]")
            elif name == "commentReference":
                parts.append(f"[comment {attr(item, 'id')}]")
            elif name == "AlternateContent":
                # Office writes a modern Choice and a legacy Fallback copy of
                # the same drawing; reading both would duplicate text boxes.
                choice = child(item, "Choice")
                self.run_text(choice if choice is not None else item, parts)
            elif name in ("drawing", "pict"):
                self.drawing_text(item, parts)
            elif name in ("pPr", "rPr", "sectPr", "fldChar", "Fallback"):
                continue
            else:
                self.run_text(item, parts)

    def drawing_text(self, el, parts):
        for doc_pr in descendants(el, "docPr"):
            self.drawings += 1
            label = attr(doc_pr, "descr") or attr(doc_pr, "title")
            if label:
                parts.append(f"[image: {clean(label)}]")
        for box in descendants(el, "txbxContent"):
            inner = []
            for para in children(box, "p"):
                text = []
                self.run_text(para, text)
                if clean("".join(text)):
                    inner.append(clean("".join(text)))
            if inner:
                parts.append(" [text box: " + " / ".join(inner) + "] ")

    def paragraph(self, para):
        parts = []
        self.run_text(para, parts)
        text = "".join(parts)
        text = "\n".join(clean(line) for line in text.split("\n")).strip()
        props = child(para, "pPr")
        prefix = ""
        if props is not None:
            style = child(props, "pStyle")
            style_name = self.style_names.get(attr(style, "val"), attr(style, "val", "")) if style is not None else ""
            lowered = style_name.lower()
            heading = re.match(r"heading\s*(\d)", lowered)
            if lowered == "title":
                prefix = "# "
            elif heading:
                prefix = "#" * min(6, int(heading.group(1)) + 1) + " "
            num = child(props, "numPr")
            if num is None and style is not None:
                num = self.style_numbering.get(attr(style, "val"))
            if num is not None and not prefix:
                level_el = child(num, "ilvl")
                num_id_el = child(num, "numId")
                level = attr(level_el, "val", "0") if level_el is not None else "0"
                num_id = attr(num_id_el, "val", "") if num_id_el is not None else ""
                fmt = self.numbering.get(num_id, {}).get(level, "bullet")
                marker = "-" if fmt in ("bullet", "none", "") else "1."
                prefix = "  " * int(level or 0) + marker + " "
        return prefix, text

    def table(self, tbl):
        rows = []
        nested = []
        for tr in children(tbl, "tr"):
            row = []
            for tc in children(tr, "tc"):
                props = child(tc, "tcPr")
                if props is not None:
                    merge = child(props, "vMerge")
                    if merge is not None and attr(merge, "val", "continue") == "continue":
                        row.append("〃")
                        continue
                texts = []
                for block in tc:
                    name = local(block.tag)
                    if name == "p":
                        texts.append(self.paragraph(block)[1])
                    elif name == "tbl":
                        nested.append((len(rows) + 1, len(row) + 1, block))
                        texts.append(f"[nested table .{len(nested)}]")
                    elif name == "sdt":
                        for para in descendants(block, "p"):
                            texts.append(self.paragraph(para)[1])
                row.append(cell_text("\n".join(t for t in texts if t)))
                props_span = child(props, "gridSpan") if props is not None else None
                for _ in range(int(attr(props_span, "val", "1")) - 1 if props_span is not None else 0):
                    row.append("←")
            rows.append(row)
        return rows, nested

    def blocks(self, container, out, label, table_label):
        """Render body/header/footer blocks with citable locations."""
        for block in container:
            name = local(block.tag)
            if name == "p":
                self.paragraphs += 1
                prefix, text = self.paragraph(block)
                if text:
                    out.line(f"{prefix}{text}  ⟨{label} ¶{self.paragraphs}⟩")
            elif name == "tbl":
                self.tables += 1
                self.render_table(block, out, f"{table_label}{self.tables}", "")
            elif name == "sdt":
                content = child(block, "sdtContent")
                if content is not None:
                    self.blocks(content, out, label, table_label)
            elif name in ("customXml", "ins", "moveTo"):
                self.blocks(block, out, label, table_label)

    def render_table(self, tbl, out, name, indent, where=""):
        rows, nested = self.table(tbl)
        out.line("")
        out.line(f"{indent}**{name}**{where} ({len(rows)} rows; first row shown as header; "
                 "〃 = vertically merged, ← = merged with left)")
        table_rows(rows, out, indent)
        for number, (row, col, inner) in enumerate(nested, 1):
            self.render_table(inner, out, f"{name}.{number}", indent + "  ",
                              f" nested in {name} row {row}, column {col}")
        out.line("")

    def load_notes(self, kind):
        root = self.package.optional_xml(self.related(kind + "s"))
        if root is None:
            return
        for note in children(root, kind):
            if attr(note, "type") in ("separator", "continuationSeparator", "continuationNotice"):
                continue
            texts = [self.paragraph(para)[1] for para in children(note, "p")]
            self.notes[kind][attr(note, "id")] = clean(" ".join(t for t in texts if t))

    def load_comments(self):
        root = self.package.optional_xml(self.related("comments"))
        if root is None:
            return
        for comment in children(root, "comment"):
            texts = [self.paragraph(para)[1] for para in descendants(comment, "p")]
            self.comments[attr(comment, "id")] = (attr(comment, "author", ""), clean(" ".join(texts)))

    def render(self, out, summary):
        root = self.package.xml(self.main)
        body = child(root, "body")
        if body is None:
            raise Unsupported("document has no body")
        self.load_notes("footnote")
        self.load_notes("endnote")
        self.load_comments()
        rels = self.package.rels(self.main)

        sections = descendants(body, "sectPr")
        seen = set()
        header_parts = []
        for number, section in enumerate(sections, 1):
            for ref in children(section, "headerReference") + children(section, "footerReference"):
                target = rels.get(rel_id(ref) or "", (None, None, None))[1]
                if target and target not in seen:
                    seen.add(target)
                    kind = "header" if local(ref.tag) == "headerReference" else "footer"
                    header_parts.append((kind, attr(ref, "type", "default"), number, target))

        out.line("## Body")
        self.blocks(body, out, "body", "Table ")
        body_paragraphs, body_tables = self.paragraphs, self.tables

        if header_parts:
            out.line("")
            out.line("## Headers and footers")
            for kind, variant, section, target in header_parts:
                part = self.package.optional_xml(target)
                if part is None:
                    continue
                label = f"{kind} ({variant}, section {section})"
                saved = self.paragraphs, self.tables
                self.paragraphs, self.tables = 0, 0
                out.line(f"### {label.capitalize()}")
                self.blocks(part, out, label, f"{kind.capitalize()} table ")
                self.paragraphs, self.tables = saved

        for kind, title in (("footnote", "Footnotes"), ("endnote", "Endnotes")):
            if self.notes[kind]:
                out.line("")
                out.line(f"## {title}")
                prefix = "fn" if kind == "footnote" else "en"
                for note_id, text in self.notes[kind].items():
                    out.line(f"[^{prefix}{note_id}]: {text}")
        if self.comments:
            out.line("")
            out.line("## Comments")
            for comment_id, (author, text) in self.comments.items():
                out.line(f"[comment {comment_id}] {author}: {text}")

        summary.update(
            paragraphs=body_paragraphs,
            tables=body_tables,
            sections=len(sections),
            headersAndFooters=len(header_parts),
            footnotes=len(self.notes["footnote"]),
            endnotes=len(self.notes["endnote"]),
            comments=len(self.comments),
            drawings=self.drawings,
        )
        if self.has_tracked_changes:
            summary.setdefault("notes", []).append(
                "Document contains tracked changes: insertions are shown, deletions are omitted"
            )


# -------------------------------------------------------------------- Charts


def chart_summary(package, part):
    """Title, type and series (name, categories, cached values) of a chart part."""
    root = package.optional_xml(part)
    if root is None:
        return []
    lines = []
    title = child(first(child(root, "chart"), root), "title")
    title_text = clean(" ".join(t.text or "" for t in descendants(title, "t"))) if title is not None else ""
    plot = descendants(root, "plotArea")
    kinds = []
    if plot:
        kinds = [local(item.tag) for item in plot[0] if local(item.tag).endswith("Chart")]
    lines.append(f"Chart{': ' + title_text if title_text else ''} ({', '.join(kinds) or 'unknown type'})")

    def cached(el):
        if el is None:
            return []
        points = []
        for cache in descendants(el, "strCache") + descendants(el, "numCache"):
            for pt in children(cache, "pt"):
                value = child(pt, "v")
                points.append((int(attr(pt, "idx", "0")), value.text if value is not None else ""))
        return [value for _, value in sorted(points)]

    for series in descendants(root, "ser"):
        name = " ".join(cached(child(series, "tx"))) or clean(
            " ".join(t.text or "" for t in descendants(first(child(series, "tx"), series), "v"))
        )
        categories = cached(first(child(series, "cat"), child(series, "xVal")))
        values = cached(first(child(series, "val"), child(series, "yVal")))
        refs = [f.text for f in descendants(series, "f") if f.text]
        line = f"  series {name or '(unnamed)'}: "
        if categories and len(categories) == len(values):
            line += ", ".join(f"{c}={v}" for c, v in zip(categories, values))
        else:
            line += f"categories={categories} values={values}"
        if refs:
            line += f" (source: {', '.join(refs)})"
        lines.append(line)
    return lines


# -------------------------------------------------------------------- PPTX


def drawing_paragraphs(body):
    """Paragraphs of a DrawingML text body with list levels."""
    result = []
    for para in children(body, "p"):
        parts = []
        for item in para.iter():
            name = local(item.tag)
            if name == "t" and item.text:
                parts.append(item.text)
            elif name == "br":
                parts.append("\n")
        text = "\n".join(clean(line) for line in "".join(parts).split("\n")).strip()
        if not text:
            continue
        props = child(para, "pPr")
        level = int(attr(props, "lvl", "0")) if props is not None else 0
        result.append((level, text))
    return result


class Pptx:
    def __init__(self, package, main):
        self.package = package
        self.main = main
        self.counts = {"tables": 0, "charts": 0, "images": 0, "slidesWithNotes": 0, "hiddenSlides": 0}

    def shape_lines(self, tree, slide_part, out, indent=""):
        for shape in tree:
            name = local(shape.tag)
            if name == "sp":
                body = child(shape, "txBody")
                if body is None:
                    continue
                ph = descendants(shape, "ph")
                ph_type = attr(ph[0], "type", "body") if ph else ""
                paragraphs = drawing_paragraphs(body)
                if not paragraphs:
                    continue
                if ph_type in ("title", "ctrTitle"):
                    out.line(f"{indent}Title: " + " / ".join(text for _, text in paragraphs))
                    continue
                if ph_type in ("sldNum", "dt", "ftr"):
                    label = {"sldNum": "Slide number", "dt": "Date", "ftr": "Footer"}[ph_type]
                    out.line(f"{indent}{label}: " + " / ".join(text for _, text in paragraphs))
                    continue
                for level, text in paragraphs:
                    out.line(f"{indent}{'  ' * level}- {text}")
            elif name == "grpSp":
                self.shape_lines(shape, slide_part, out, indent)
            elif name == "pic":
                self.counts["images"] += 1
                props = descendants(shape, "cNvPr")
                label = (attr(props[0], "descr") or attr(props[0], "title") or attr(props[0], "name")) if props else ""
                out.line(f"{indent}[image: {clean(label or 'no description')}]")
            elif name == "graphicFrame":
                self.graphic_frame(shape, slide_part, out, indent)
            elif name == "AlternateContent":
                choice = child(shape, "Choice")
                if choice is not None:
                    self.shape_lines(choice, slide_part, out, indent)

    def graphic_frame(self, frame, slide_part, out, indent):
        rels = self.package.rels(slide_part)
        for tbl in descendants(frame, "tbl"):
            self.counts["tables"] += 1
            rows = []
            for tr in children(tbl, "tr"):
                row = []
                for tc in children(tr, "tc"):
                    if on_off(tc, "hMerge") or on_off(tc, "vMerge"):
                        row.append("〃")
                        continue
                    body = child(tc, "txBody")
                    texts = [text for _, text in drawing_paragraphs(body)] if body is not None else []
                    row.append(cell_text("\n".join(texts)))
                rows.append(row)
            out.line(f"{indent}**Table {self.counts['tables']}** ({len(rows)} rows):")
            table_rows(rows, out, indent)
        for chart in descendants(frame, "chart"):
            target = rels.get(rel_id(chart) or "", (None, None, None))[1]
            if target:
                self.counts["charts"] += 1
                for line in chart_summary(self.package, target):
                    out.line(indent + line)
        for diagram in descendants(frame, "relIds"):
            target = rels.get(rel_id(diagram, "dm") or "", (None, None, None))[1]
            data = self.package.optional_xml(target)
            if data is not None:
                texts = [clean(t.text or "") for t in descendants(data, "t") if clean(t.text or "")]
                if texts:
                    out.line(f"{indent}SmartArt: " + " / ".join(texts))

    def render(self, out, summary, wanted):
        root = self.package.xml(self.main)
        rels = self.package.rels(self.main)
        slide_list = child(root, "sldIdLst")
        slides = []
        for slide_id in children(slide_list, "sldId") if slide_list is not None else []:
            target = rels.get(rel_id(slide_id) or "", (None, None, None))[1]
            if target:
                slides.append(target)
        summary["slides"] = len(slides)
        for number, part in enumerate(slides, 1):
            if wanted and number not in wanted:
                continue
            slide = self.package.optional_xml(part)
            if slide is None:
                out.line(f"## Slide {number}: unreadable part {part}")
                continue
            hidden = not on_off(slide, "show", True)
            if hidden:
                self.counts["hiddenSlides"] += 1
            out.line("")
            out.line(f"## Slide {number}{' (hidden)' if hidden else ''}")
            for tree in descendants(slide, "spTree")[:1]:
                self.shape_lines(tree, part, out)
            for _, notes_part in self.package.rels_of_type(part, "notesSlide"):
                notes = self.package.optional_xml(notes_part)
                if notes is None:
                    continue
                texts = []
                for shape in descendants(notes, "sp"):
                    ph = descendants(shape, "ph")
                    body = child(shape, "txBody")
                    if ph and attr(ph[0], "type") == "body" and body is not None:
                        texts.extend(text for _, text in drawing_paragraphs(body))
                if texts:
                    self.counts["slidesWithNotes"] += 1
                    out.line("Speaker notes: " + " / ".join(texts))
        summary.update(self.counts)


# -------------------------------------------------------------------- XLSX


CELL_REF = re.compile(r"^([A-Z]{1,3})(\d+)$")
BUILTIN_DATE_FORMATS = set(range(14, 23)) | {45, 46, 47}


def column_number(letters):
    number = 0
    for letter in letters:
        number = number * 26 + ord(letter) - 64
    return number


def column_letters(number):
    letters = ""
    while number:
        number, rem = divmod(number - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def split_ref(ref):
    match = CELL_REF.match(ref.replace("$", ""))
    if not match:
        return None
    return column_number(match.group(1)), int(match.group(2))


def parse_range(text):
    if not text:
        return None
    start, _, end = text.upper().partition(":")
    first = split_ref(start)
    last = split_ref(end or start)
    if not first or not last:
        raise SystemExit(f"read_office: invalid --range {text!r}; use A1:D20")
    return (min(first[0], last[0]), min(first[1], last[1]), max(first[0], last[0]), max(first[1], last[1]))


FORMULA_REF = re.compile(r"(?<![A-Za-z0-9_.!\]])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(!])")


def translate_formula(formula, origin, target):
    """Shift relative A1 references of a shared formula from its anchor cell."""
    o_col, o_row = origin
    t_col, t_row = target
    d_col, d_row = t_col - o_col, t_row - o_row

    def shift(match):
        col_abs, col, row_abs, row = match.groups()
        new_col = column_number(col) + (0 if col_abs else d_col)
        new_row = int(row) + (0 if row_abs else d_row)
        if new_col < 1 or new_row < 1:
            return "#REF!"
        return f"{col_abs}{column_letters(new_col)}{row_abs}{new_row}"

    # Leave string literals untouched; references only occur outside quotes.
    pieces = re.split(r'("(?:[^"]|"")*")', formula)
    return "".join(piece if piece.startswith('"') else FORMULA_REF.sub(shift, piece) for piece in pieces)


def is_date_format(code):
    code = re.sub(r'"[^"]*"|\[[^\]]*\]|\\.', "", code or "").lower()
    return bool(re.search(r"[dmyhs]", code)) and "general" not in code


def excel_date(serial, date1904):
    base = datetime.datetime(1904, 1, 1) if date1904 else datetime.datetime(1899, 12, 30)
    if not date1904 and serial < 61:
        serial += 1  # Excel's fictitious 1900-02-29
    value = base + datetime.timedelta(days=serial)
    if value.hour == value.minute == value.second == 0 and value.microsecond == 0:
        return value.date().isoformat()
    return value.isoformat(timespec="seconds")


class Xlsx:
    def __init__(self, package, main, limits):
        self.package = package
        self.main = main
        self.limits = limits
        self.shared = []
        self.date_styles = set()
        self.date1904 = False
        self.counts = {"formulas": 0, "formulasWithoutCachedValue": 0, "charts": 0, "comments": 0}

    def load(self):
        for _, target in self.package.rels_of_type(self.main, "sharedStrings"):
            root = self.package.optional_xml(target)
            if root is None:
                continue
            for si in children(root, "si"):
                # Plain <t> or rich-text runs <r><t>; phonetic guides (rPh) are not the value.
                parts = []
                for item in si:
                    if local(item.tag) == "t":
                        parts.append(item.text or "")
                    elif local(item.tag) == "r":
                        parts.extend(t.text or "" for t in children(item, "t"))
                self.shared.append("".join(parts))
        styles = self.package.optional_xml(next((t for _, t in self.package.rels_of_type(self.main, "styles")), None))
        if styles is not None:
            custom = {}
            num_fmts = child(styles, "numFmts")
            for fmt in children(num_fmts, "numFmt") if num_fmts is not None else []:
                custom[int(attr(fmt, "numFmtId", "0"))] = attr(fmt, "formatCode", "")
            xfs = child(styles, "cellXfs")
            for index, xf in enumerate(children(xfs, "xf") if xfs is not None else []):
                fmt_id = int(attr(xf, "numFmtId", "0"))
                if fmt_id in BUILTIN_DATE_FORMATS or (fmt_id in custom and is_date_format(custom[fmt_id])):
                    self.date_styles.add(index)

    def cell_value(self, cell):
        kind = attr(cell, "t", "n")
        value_el = child(cell, "v")
        raw = value_el.text if value_el is not None else None
        if kind == "inlineStr":
            inline = child(cell, "is")
            return "".join(t.text or "" for t in descendants(inline, "t")) if inline is not None else "", "string"
        if raw is None:
            return None, kind
        if kind == "s":
            try:
                return self.shared[int(raw)], "string"
            except (ValueError, IndexError):
                return f"#invalid shared string {raw}", "error"
        if kind == "b":
            return "TRUE" if raw == "1" else "FALSE", "boolean"
        if kind == "e":
            return raw, "error"
        if kind in ("str", "d"):
            return raw, "string" if kind == "str" else "date"
        style = int(attr(cell, "s", "0"))
        if style in self.date_styles:
            try:
                return excel_date(float(raw), self.date1904), "date"
            except (ValueError, OverflowError):
                pass
        try:
            number = float(raw)
            return (str(int(number)) if number.is_integer() and abs(number) < 1e15 else repr(number)), "number"
        except ValueError:
            return raw, "number"

    def sheet(self, name, part, state, out, wanted_range):
        # Stream the worksheet: memory stays bounded by the displayed window,
        # not by the sheet's size.
        shared_formulas = {}
        cells = {}
        formulas = []
        formula_limit = self.limits.max_rows * 2
        listed_formulas = 0
        merged = []
        max_row = max_col = 0
        dimension = ""
        non_empty = 0
        window = None if wanted_range is None else (wanted_range[1], wanted_range[3])
        sheet_data = None
        try:
            for event, el in ET.iterparse(self.package.stream(part), events=("start", "end")):
                tag = local(el.tag)
                if event == "start":
                    if tag == "sheetData":
                        sheet_data = el
                    continue
                if tag == "dimension":
                    dimension = attr(el, "ref", "")
                elif tag == "mergeCell":
                    merged.append(attr(el, "ref", ""))
                elif tag == "c":
                    position = split_ref(attr(el, "r", ""))
                    if position is None:
                        el.clear()
                        continue
                    col, row = position
                    formula_el = child(el, "f")
                    formula = None
                    if formula_el is not None:
                        f_type = attr(formula_el, "t", "normal")
                        text = formula_el.text or ""
                        if f_type == "shared":
                            index = attr(formula_el, "si")
                            if text:
                                shared_formulas[index] = (text, (col, row))
                            elif index in shared_formulas:
                                origin_text, origin = shared_formulas[index]
                                text = translate_formula(origin_text, origin, (col, row))
                        if f_type == "dataTable":
                            text = f"data table (r1={attr(formula_el, 'r1', '')}, r2={attr(formula_el, 'r2', '')})"
                        formula = ("{" + text + "}" if f_type == "array" and text else text) or f"({f_type} formula)"
                    value, kind = self.cell_value(el)
                    el.clear()
                    if value is None and not formula:
                        continue
                    non_empty += 1
                    max_row, max_col = max(max_row, row), max(max_col, col)
                    if formula:
                        self.counts["formulas"] += 1
                        if value is None:
                            self.counts["formulasWithoutCachedValue"] += 1
                    in_range = wanted_range is None or (
                        wanted_range[0] <= col <= wanted_range[2] and wanted_range[1] <= row <= wanted_range[3]
                    )
                    if not in_range:
                        continue
                    if window is None:
                        # Rows are stored in ascending order; the grid starts at the first used row.
                        window = (row, row + self.limits.max_rows - 1)
                    if window[0] <= row <= window[1]:
                        cells[(row, col)] = (value, kind, formula)
                    if formula:
                        listed_formulas += 1
                        if len(formulas) < formula_limit:
                            formulas.append((row, col, formula, value, kind))
                elif tag == "row" and sheet_data is not None:
                    sheet_data.clear()
        except ET.ParseError as error:
            raise Unsupported(f"malformed XML in {part}: {error}")
        except zipfile.BadZipFile as error:
            raise Unsupported(f"cannot read package part {part}: {error}")

        title = f"## Sheet \"{name}\""
        if state != "visible":
            title += f" ({state})"
        out.line("")
        out.line(title)
        used = f"A1:{column_letters(max_col)}{max_row}" if max_row else "empty"
        out.line(f"Used range: {used}{'; declared dimension ' + dimension if dimension and dimension != used else ''}; "
                 f"{non_empty} non-empty cells")
        if merged:
            out.line("Merged ranges: " + ", ".join(merged[:50]) + (" …" if len(merged) > 50 else ""))
        if cells:
            first_col = wanted_range[0] if wanted_range else min(col for _, col in cells)
            first_row = wanted_range[1] if wanted_range else min(row for row, _ in cells)
            last_col = min(wanted_range[2] if wanted_range else max_col, first_col + self.limits.max_cols - 1)
            last_row = min(wanted_range[3] if wanted_range else max_row, first_row + self.limits.max_rows - 1)
            header = ["row"] + [column_letters(c) for c in range(first_col, last_col + 1)]
            rows = [header]
            for row in range(first_row, last_row + 1):
                values = []
                for col in range(first_col, last_col + 1):
                    value, kind, formula = cells.get((row, col), (None, None, None))
                    values.append(cell_text(value if value is not None else ("(no cached value)" if formula else "")))
                if any(values):
                    rows.append([str(row)] + values)
            out.line("Cached values (as last saved; raw numbers without currency/percent formatting, dates as ISO; formulas listed below):")
            table_rows(rows, out)
            if (wanted_range is None and (max_row > last_row or max_col > last_col)) or (
                wanted_range and (wanted_range[2] > last_col or wanted_range[3] > last_row)
            ):
                out.line(
                    f"[Grid limited to {self.limits.max_rows} rows × {self.limits.max_cols} columns; "
                    "use --range (e.g. --range A1:H200), --max-rows or --max-cols to see more]"
                )
        if formulas:
            out.line("")
            out.line("Formulas (cell: =expression → cached value):")
            for row, col, formula, value, kind in formulas:
                shown = "(no cached value; the workbook was saved without calculating it)" if value is None else value
                out.line(f"- {column_letters(col)}{row}: ={formula} → {shown}")
            if listed_formulas > len(formulas):
                out.line(f"[{listed_formulas - len(formulas)} more formulas not listed; use --range]")
        self.sheet_extras(part, out)

    def sheet_extras(self, part, out):
        comments = []
        for rid, (rtype, target, external) in self.package.rels(part).items():
            if external:
                continue
            if rtype.endswith("/comments"):
                root = self.package.optional_xml(target)
                if root is None:
                    continue
                authors = [a.text or "" for a in descendants(root, "author")]
                for comment in descendants(root, "comment"):
                    author_id = attr(comment, "authorId", "")
                    author = authors[int(author_id)] if author_id.isdigit() and int(author_id) < len(authors) else ""
                    text = clean(" ".join(t.text or "" for t in descendants(comment, "t")))
                    comments.append(f"- {attr(comment, 'ref', '')} {author}: {text}")
            elif rtype.endswith("/drawing"):
                for _, chart_part in self.package.rels_of_type(target, "chart"):
                    self.counts["charts"] += 1
                    out.line("")
                    for line in chart_summary(self.package, chart_part):
                        out.line(line)
        if comments:
            self.counts["comments"] += len(comments)
            out.line("")
            out.line("Cell comments/notes:")
            for line in comments:
                out.line(line)

    def render(self, out, summary, wanted_sheet, wanted_range):
        root = self.package.xml(self.main)
        props = child(root, "workbookPr")
        self.date1904 = props is not None and on_off(props, "date1904")
        self.load()
        rels = self.package.rels(self.main)
        sheets_el = child(root, "sheets")
        sheets = []
        for sheet in children(sheets_el, "sheet") if sheets_el is not None else []:
            target = rels.get(rel_id(sheet) or "", (None, None, None))
            sheets.append((attr(sheet, "name", ""), target[0] or "", target[1], attr(sheet, "state", "visible")))
        summary["sheets"] = [{"name": n, "state": s} for n, _, _, s in sheets]
        out.line("Sheets: " + ", ".join(f"\"{n}\"" + ("" if s == "visible" else f" ({s})") for n, _, _, s in sheets))
        names = child(root, "definedNames")
        if names is not None and len(names):
            out.line("Defined names: " + "; ".join(f"{attr(n, 'name')} = {n.text}" for n in children(names, "definedName")))
        if wanted_sheet and wanted_sheet not in [n for n, _, _, _ in sheets]:
            raise SystemExit(f"read_office: no sheet named {wanted_sheet!r}")
        for name, rtype, part, state in sheets:
            if wanted_sheet and name != wanted_sheet:
                continue
            if not part or not self.package.has(part):
                out.line(f"## Sheet \"{name}\": part missing")
                continue
            if rtype.endswith("/chartsheet"):
                out.line("")
                out.line(f"## Chart sheet \"{name}\"")
                for _, drawing in self.package.rels_of_type(part, "drawing"):
                    for _, chart_part in self.package.rels_of_type(drawing, "chart"):
                        self.counts["charts"] += 1
                        for line in chart_summary(self.package, chart_part):
                            out.line(line)
                continue
            self.sheet(name, part, state, out, wanted_range)
        summary.update(self.counts)
        if self.counts["formulasWithoutCachedValue"]:
            summary.setdefault("notes", []).append(
                f"{self.counts['formulasWithoutCachedValue']} formula cells have no cached value; their results are "
                "unknown until the workbook is recalculated in a spreadsheet application"
            )


# --------------------------------------------------------------------- Main


def package_notes(package, summary):
    names = list(package.infos)
    notes = summary.setdefault("notes", [])
    if any(n.lower().endswith("vbaproject.bin") for n in names):
        notes.append("Contains a VBA macro project; macros were not run or inspected")
    embedded = [n.rsplit("/", 1)[-1] for n in names if "/embeddings/" in n]
    if embedded:
        notes.append(
            f"Contains {len(embedded)} embedded file(s), such as chart data workbooks or OLE objects, whose own "
            "contents are not extracted: " + ", ".join(embedded[:10]) + (" …" if len(embedded) > 10 else "")
        )
    if any("/externalLinks/" in n for n in names):
        notes.append("Workbook links to external workbooks; linked values are the cached copies")
    if any("/pivotTables/" in n for n in names):
        notes.append("Contains pivot tables; their cells show the last cached results")
    core = package.optional_xml("docProps/core.xml")
    if core is not None:
        for item in core:
            if local(item.tag) in ("title", "creator", "lastModifiedBy", "created", "modified") and clean(item.text or ""):
                summary.setdefault("properties", {})[local(item.tag)] = clean(item.text)


def parse_slides(text):
    if not text:
        return None
    wanted = set()
    for piece in text.split(","):
        start, _, end = piece.strip().partition("-")
        try:
            wanted.update(range(int(start), int(end or start) + 1))
        except ValueError:
            raise SystemExit(f"read_office: invalid --slides {text!r}; use 1,3-5")
    return wanted


def read_document(path, args):
    limits = Limits(args)
    summary = {"file": path}
    out = Output(args.max_chars)
    try:
        handle = open(path, "rb")
        size = os.fstat(handle.fileno()).st_size
    except OSError as error:
        return {**summary, "status": "error", "error": f"cannot read file: {error.strerror or error}"}, ""
    with handle:
        if size > limits.max_input_bytes:
            return {**summary, "status": "unsupported",
                    "error": f"file is larger than {limits.max_input_bytes} bytes (--max-input-bytes)"}, ""
        summary["bytes"] = size
        return render_document(path, handle, limits, args, summary, out)


def render_document(path, handle, limits, args, summary, out):
    try:
        package, main, kind, label = identify(path, handle, limits)
        summary.update(format=label)
        extension = path.rsplit(".", 1)[-1].lower() if "." in path.rsplit("/", 1)[-1] else ""
        if extension and extension not in EXTENSIONS[kind]:
            summary.setdefault("notes", []).append(
                f"File name ends in .{extension} but its content is {label}; it was read as {label}"
            )
        if kind == "docx":
            Docx(package, main).render(out, summary)
        elif kind == "pptx":
            Pptx(package, main).render(out, summary, parse_slides(args.slides))
        else:
            Xlsx(package, main, limits).render(out, summary, args.sheet, parse_range(args.range))
        package_notes(package, summary)
        if package.warnings:
            summary["warnings"] = package.warnings
    except Unsupported as error:
        return {**summary, "status": "unsupported", "error": str(error)}, ""
    summary["status"] = "ok"
    if out.truncated:
        summary["truncated"] = True
        out.parts.append(
            f"\n[Output truncated at {args.max_chars} characters. Narrow it with --sheet/--range/--slides, "
            "raise --max-chars, or write the full extract with --out and search it.]"
        )
    return summary, out.text()


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Extract text, tables, slides, sheets, formulas and cached values from DOCX/PPTX/XLSX files."
    )
    parser.add_argument("files", nargs="+", help="Office files to read (format is detected from content)")
    parser.add_argument("--json", action="store_true", help="emit one JSON object per file instead of Markdown")
    parser.add_argument("--out", help="write the extract to this file instead of stdout")
    parser.add_argument("--sheet", help="XLSX: only this sheet (exact name)")
    parser.add_argument("--range", help="XLSX: only cells in this A1 range, e.g. B2:F40")
    parser.add_argument("--slides", help="PPTX: only these slide numbers, e.g. 1,3-5")
    parser.add_argument("--max-chars", type=int, default=DEFAULT_MAX_CHARS,
                        help=f"truncate each file's extract after this many characters (0 = no limit; default {DEFAULT_MAX_CHARS})")
    parser.add_argument("--max-rows", type=int, default=DEFAULT_MAX_ROWS, help="XLSX: grid rows shown per sheet")
    parser.add_argument("--max-cols", type=int, default=DEFAULT_MAX_COLS, help="XLSX: grid columns shown per sheet")
    parser.add_argument("--max-input-bytes", type=int, default=DEFAULT_MAX_INPUT_BYTES, help=argparse.SUPPRESS)
    parser.add_argument("--max-part-bytes", type=int, default=DEFAULT_MAX_PART_BYTES, help=argparse.SUPPRESS)
    parser.add_argument("--max-total-bytes", type=int, default=DEFAULT_MAX_TOTAL_BYTES, help=argparse.SUPPRESS)
    args = parser.parse_args(argv)

    chunks = []
    failures = 0
    for path in args.files:
        summary, text = read_document(path, args)
        if summary["status"] != "ok":
            failures += 1
        if args.json:
            chunks.append(json.dumps({**summary, "content": text}, ensure_ascii=False))
        else:
            header = [f"# {path}"]
            if summary["status"] == "ok":
                facts = {k: v for k, v in summary.items() if k not in ("file", "status", "notes", "warnings", "properties", "truncated")}
                header.append("Summary: " + json.dumps(facts, ensure_ascii=False))
                for key in ("properties",):
                    if key in summary:
                        header.append("Properties: " + json.dumps(summary[key], ensure_ascii=False))
                for note in summary.get("notes", []) + summary.get("warnings", []):
                    header.append(f"Note: {note}")
                chunks.append("\n".join(header) + "\n\n" + text)
            else:
                header.append(f"{summary['status'].upper()}: {summary['error']}")
                chunks.append("\n".join(header))
    result = "\n\n".join(chunks) + "\n"
    if args.out:
        with open(args.out, "w", encoding="utf-8") as handle:
            handle.write(result)
        print(f"Wrote {len(result)} characters for {len(args.files)} file(s) to {args.out}")
    else:
        sys.stdout.write(result)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
