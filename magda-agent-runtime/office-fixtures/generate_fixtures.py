#!/usr/bin/env python3
"""Regenerate the Office reader test fixtures with known contents.

Development-time only; the runtime image never runs this file. Run it from a
throwaway virtual environment:

    uv venv /tmp/office-fixtures --python 3.11
    uv pip install --python /tmp/office-fixtures/bin/python \
        python-docx==1.2.0 python-pptx==1.0.2 XlsxWriter==3.2.9 openpyxl==3.1.5
    /tmp/office-fixtures/bin/python generate_fixtures.py

Generated files are committed, so tests do not need these libraries. The
facts asserted by test_office_skills.py are defined here.
"""

import datetime
import io
import os
import re
import zipfile

import docx
import openpyxl
import xlsxwriter
from docx.enum.section import WD_HEADER_FOOTER
from docx.shared import Pt
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.util import Inches

HERE = os.path.dirname(os.path.abspath(__file__))
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def path(name):
    return os.path.join(HERE, name)


def rewrite_zip(name, edit):
    """Rewrite a package with stable timestamps, letting edit() change parts."""
    with zipfile.ZipFile(path(name)) as source:
        parts = {info.filename: source.read(info) for info in source.infolist()}
    edit(parts)
    with zipfile.ZipFile(path(name), "w", zipfile.ZIP_DEFLATED) as target:
        for part_name in sorted(parts, key=lambda n: (n != "[Content_Types].xml", n)):
            info = zipfile.ZipInfo(part_name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, parts[part_name])


def stable_core(parts):
    """Pin generation timestamps so regenerated fixtures are byte-identical."""
    if "docProps/core.xml" in parts:
        core = parts["docProps/core.xml"].decode()
        core = re.sub(r"(<dcterms:(created|modified)[^>]*>)[^<]*", r"\g<1>2026-01-01T00:00:00Z", core)
        parts["docProps/core.xml"] = core.encode()
    if "word/comments.xml" in parts:
        comments = parts["word/comments.xml"].decode()
        parts["word/comments.xml"] = re.sub(r'w:date="[^"]*"', 'w:date="2026-01-01T00:00:00Z"', comments).encode()
    for name in [n for n in parts if "/embeddings/" in n and n.endswith(".xlsx")]:
        with zipfile.ZipFile(io.BytesIO(parts[name])) as source:
            inner = {info.filename: source.read(info) for info in source.infolist()}
        stable_core(inner)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as target:
            for part_name in sorted(inner, key=lambda n: (n != "[Content_Types].xml", n)):
                target.writestr(zipfile.ZipInfo(part_name, FIXED_TIME), inner[part_name])
        parts[name] = buffer.getvalue()


# ---------------------------------------------------------------- DOCX


FOOTNOTES = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    '<w:footnotes xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
    '<w:footnote w:type="separator" w:id="-1"><w:p><w:r><w:separator/></w:r></w:p></w:footnote>'
    '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
    '<w:footnote w:id="1"><w:p><w:r><w:t>Calibrated against the CSIRO reference probe in February 2026.</w:t></w:r></w:p></w:footnote>'
    "</w:footnotes>"
)


def make_docx():
    document = docx.Document()
    document.core_properties.title = "Coastal Monitoring Report"
    document.core_properties.author = "Field Operations"
    document.add_heading("Coastal Monitoring Report", level=0)
    document.add_heading("Summary", level=1)
    summary = document.add_paragraph("Station BW-7 recorded a peak salinity of ")
    summary.add_run("35.2 PSU").bold = True
    summary.add_run(" on 14 March 2026.FOOTNOTE_MARKER")
    document.add_paragraph("Turbidity stayed below the 5 NTU trigger at every site.", style="List Bullet")
    document.add_paragraph("Two loggers were replaced after storm damage.", style="List Bullet")
    document.add_heading("Site results", level=1)

    table = document.add_table(rows=4, cols=3)
    table.style = "Table Grid"
    for row, values in enumerate([
        ("Site", "Samples", "Lead scientist"),
        ("North Reef", "42", "Dr Amara Okafor"),
        ("South Lagoon", "37", "Dr Lucas Brandt"),
        ("Total", "79", ""),
    ]):
        for col, value in enumerate(values):
            table.cell(row, col).text = value
    # A nested table of replicate measurements inside the North Reef lead cell.
    inner_cell = table.cell(1, 2)
    inner = inner_cell.add_table(rows=2, cols=2)
    inner.cell(0, 0).text = "Replicate A"
    inner.cell(0, 1).text = "7.81"
    inner.cell(1, 0).text = "Replicate B"
    inner.cell(1, 1).text = "7.79"
    # Merge the last row's last two cells to exercise horizontal merges.
    table.cell(3, 1).merge(table.cell(3, 2))
    table.cell(3, 1).text = "79 samples in total"

    comment_paragraph = document.add_paragraph("Recommendation: extend monitoring to Eastern Shoal in 2027.")
    document.add_comment(comment_paragraph.runs, text="Check the Eastern Shoal budget first.", author="Priya Natarajan")

    section = document.sections[0]
    section.header.paragraphs[0].text = "CONFIDENTIAL DRAFT - Marine Division"
    section.footer.paragraphs[0].text = "Prepared by Field Operations"
    section.different_first_page_header_footer = True
    section.first_page_header.paragraphs[0].text = "Cover page header"
    for style in ("Normal",):
        document.styles[style].font.size = Pt(11)
    document.save(path("report.docx"))

    def add_footnote(parts):
        body = parts["word/document.xml"].decode()
        marker = (
            '<w:r><w:rPr><w:vertAlign w:val="superscript"/></w:rPr>'
            '<w:footnoteReference w:id="1"/></w:r>'
        )
        body = re.sub(r"FOOTNOTE_MARKER</w:t></w:r>", "</w:t></w:r>" + marker, body)
        parts["word/document.xml"] = body.encode()
        parts["word/footnotes.xml"] = FOOTNOTES.encode()
        rels = parts["word/_rels/document.xml.rels"].decode().replace(
            "</Relationships>",
            '<Relationship Id="rIdFootnotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/'
            'relationships/footnotes" Target="footnotes.xml"/></Relationships>',
        )
        parts["word/_rels/document.xml.rels"] = rels.encode()
        types = parts["[Content_Types].xml"].decode().replace(
            "</Types>",
            '<Override PartName="/word/footnotes.xml" ContentType="application/vnd.openxmlformats-'
            'officedocument.wordprocessingml.footnotes+xml"/></Types>',
        )
        parts["[Content_Types].xml"] = types.encode()
        stable_core(parts)

    rewrite_zip("report.docx", add_footnote)


# ---------------------------------------------------------------- PPTX


def make_pptx():
    deck = Presentation()
    deck.core_properties.title = "Field Season Briefing"

    title = deck.slides.add_slide(deck.slide_layouts[0])
    title.shapes.title.text = "Field Season Briefing"
    title.placeholders[1].text = "Prepared for the Steering Committee"

    agenda = deck.slides.add_slide(deck.slide_layouts[1])
    agenda.shapes.title.text = "Priorities"
    body = agenda.placeholders[1].text_frame
    body.text = "Expand sampling to three new estuaries"
    sub = body.add_paragraph()
    sub.text = "Hawkesbury, Clarence and Richmond"
    sub.level = 1
    body.add_paragraph().text = "Replace ageing loggers before winter"
    agenda.notes_slide.notes_text_frame.text = "Remind the committee that budget approval is due 30 June."

    budget = deck.slides.add_slide(deck.slide_layouts[5])
    budget.shapes.title.text = "Budget by region"
    rows = [("Region", "Budget (AUD)"), ("Pilbara", "1,250,000"), ("Kimberley", "980,000")]
    table = budget.shapes.add_table(len(rows), 2, Inches(1), Inches(2), Inches(6), Inches(1.5)).table
    for r, row in enumerate(rows):
        for c, value in enumerate(row):
            table.cell(r, c).text = value
    group = budget.shapes.add_group_shape()
    box = group.shapes.add_textbox(Inches(1), Inches(4.5), Inches(4), Inches(0.5))
    box.text_frame.text = "Figures exclude GST"

    chart_slide = deck.slides.add_slide(deck.slide_layouts[5])
    chart_slide.shapes.title.text = "Samples collected"
    data = CategoryChartData()
    data.categories = ["Q1", "Q2", "Q3", "Q4"]
    data.add_series("Samples", (120, 135, 160, 98))
    frame = chart_slide.shapes.add_chart(
        XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(1), Inches(1.5), Inches(7), Inches(4.5), data
    )
    frame.chart.has_title = True
    frame.chart.chart_title.text_frame.text = "Samples by quarter"

    hidden = deck.slides.add_slide(deck.slide_layouts[1])
    hidden.shapes.title.text = "Contingency"
    hidden.placeholders[1].text = "Contingency plan B: charter a second vessel"
    hidden._element.set("show", "0")
    deck.save(path("briefing.pptx"))
    rewrite_zip("briefing.pptx", stable_core)


# ---------------------------------------------------------------- XLSX


def make_xlsx():
    workbook = xlsxwriter.Workbook(path("budget.xlsx"))
    workbook.set_properties({"title": "Programme budget", "author": "Finance", "created": datetime.datetime(2026, 1, 1)})
    bold = workbook.add_format({"bold": True})
    money = workbook.add_format({"num_format": "#,##0.00"})
    date = workbook.add_format({"num_format": "yyyy-mm-dd"})

    summary = workbook.add_worksheet("Summary")
    summary.merge_range("A1:C1", "FY2026 Programme Budget", bold)
    summary.write_row("A2", ["Item", "Cost", "Approved"], bold)
    for row, (item, cost, approved) in enumerate(
        [("Vessel charter", 250000, True), ("Sensors", 125000.5, False), ("Staff", 410000, True)], start=3
    ):
        summary.write(f"A{row}", item)
        summary.write_number(f"B{row}", cost, money)
        summary.write_boolean(f"C{row}", approved)
    summary.write("A6", "Total", bold)
    summary.write_formula("B6", "=SUM(B3:B5)", money, 785000.5)
    summary.write("A7", "Approved total")
    summary.write_formula("B7", '=SUMIF(C3:C5,TRUE,B3:B5)', money, 660000)
    summary.write("A8", "Review date")
    summary.write_datetime("B8", datetime.datetime(2026, 3, 31), date)
    summary.write("A9", "Status")
    summary.write_formula("B9", '=IF(B6>700000,"Over cap","Within cap")', None, "Over cap")
    summary.write_comment("B6", "Includes GST-free items only", {"author": "Finance"})

    detail = workbook.add_worksheet("Detail")
    detail.write_row("A1", ["Quarter", "Share of total"])
    for row, (quarter, share) in enumerate([("Q1", 0.25), ("Q2", 0.25), ("Q3", 0.3), ("Q4", 0.2)], start=2):
        detail.write(f"A{row}", quarter)
        detail.write_number(f"B{row}", share)
        detail.write_formula(f"C{row}", f"=Summary!$B$6*B{row}", money, round(785000.5 * share, 3))
    detail.write("A7", "Check")
    detail.write_formula("C7", "=SUM(C2:C5)", money, 785000.5)

    lookup = workbook.add_worksheet("Lookup")
    lookup.write("A1", "Internal rate table")
    lookup.write("A2", 0.045)
    lookup.hide()
    workbook.close()
    rewrite_zip("budget.xlsx", stable_core)

    charts = xlsxwriter.Workbook(path("charts.xlsx"))
    charts.set_properties({"created": datetime.datetime(2026, 1, 1)})
    data = charts.add_worksheet("Data")
    data.write_column("A1", ["Q1", "Q2", "Q3"])
    data.write_column("B1", [5, 7, 9])
    line = charts.add_chart({"type": "line"})
    line.add_series({"name": "Visits", "categories": "=Data!$A$1:$A$3", "values": "=Data!$B$1:$B$3"})
    line.set_title({"name": "Visits by quarter"})
    data.insert_chart("D2", line)
    column = charts.add_chart({"type": "column"})
    column.add_series({"name": "Visits", "categories": "=Data!$A$1:$A$3", "values": "=Data!$B$1:$B$3"})
    charts.add_chartsheet("Trend").set_chart(column)
    charts.close()
    rewrite_zip("charts.xlsx", stable_core)

    # openpyxl writes formulas without cached values, like a generated file
    # that was never opened in Excel.
    book = openpyxl.Workbook()
    sheet = book.active
    sheet.title = "Calc"
    sheet["A1"], sheet["A2"], sheet["A3"] = 2, 3, "=A1*A2"
    book.save(path("uncalculated.xlsx"))
    rewrite_zip("uncalculated.xlsx", stable_core)


# ------------------------------------------------------- Edge-case packages


def write_package(name, parts):
    with zipfile.ZipFile(path(name), "w", zipfile.ZIP_DEFLATED) as target:
        for part_name, data in parts.items():
            info = zipfile.ZipInfo(part_name, FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, data)


SHARED_FORMULA_SHEETS = {
    # Doubles: B1:B4 shares A1*2 down a column; C1:E1 shares a sheet-qualified
    # relative reference across a row with an absolute $A$1; F1:F2 shares a
    # quoted sheet name with an absolute column and a relative row.
    "Doubles": "".join(
        f'<row r="{r}"><c r="A{r}"><v>{r * 10}</v></c><c r="B{r}">'
        + (f'<f t="shared" ref="B1:B4" si="0">A{r}*2</f>' if r == 1 else '<f t="shared" si="0"/>')
        + f"<v>{r * 20}</v></c>"
        + (
            '<c r="C1"><f t="shared" ref="C1:E1" si="1">Rates!A1+$A$1</f><v>11</v></c>'
            '<c r="D1"><f t="shared" si="1"/><v>12</v></c><c r="E1"><f t="shared" si="1"/><v>13</v></c>'
            if r == 1 else ""
        )
        + (
            '<c r="F1"><f t="shared" ref="F1:F2" si="2">\'Rate Table\'!$B1*A1</f><v>50</v></c>'
            if r == 1 else '<c r="F2"><f t="shared" si="2"/><v>120</v></c>' if r == 2 else ""
        )
        + "</row>"
        for r in range(1, 5)
    ),
    "Rates": '<row r="1"><c r="A1"><v>1</v></c><c r="B1"><v>2</v></c><c r="C1"><v>3</v></c></row>',
    "Rate Table": '<row r="1"><c r="B1"><v>5</v></c></row><row r="2"><c r="B2"><v>6</v></c></row>',
}


def shared_formula_workbook(name, strict):
    main = "http://purl.oclc.org/ooxml/spreadsheetml/main" if strict else \
        "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    rel = "http://purl.oclc.org/ooxml/officeDocument/relationships" if strict else \
        "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    sheets = list(SHARED_FORMULA_SHEETS.items())
    parts = {
        "[Content_Types].xml": (
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            + "".join(
                f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType="application/vnd.openxmlformats-'
                'officedocument.spreadsheetml.worksheet+xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + "</Types>"
        ),
        "_rels/.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{rel}/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            f'<workbook xmlns="{main}" xmlns:r="{rel}"><sheets>'
            + "".join(f'<sheet name="{n}" sheetId="{i}" r:id="rId{i}"/>' for i, (n, _) in enumerate(sheets, 1))
            + "</sheets></workbook>"
        ),
        "xl/_rels/workbook.xml.rels": (
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            + "".join(
                f'<Relationship Id="rId{i}" Type="{rel}/worksheet" Target="worksheets/sheet{i}.xml"/>'
                for i in range(1, len(sheets) + 1)
            )
            + "</Relationships>"
        ),
    }
    for i, (_, cells) in enumerate(sheets, 1):
        parts[f"xl/worksheets/sheet{i}.xml"] = f'<worksheet xmlns="{main}"><sheetData>{cells}</sheetData></worksheet>'
    write_package(name, parts)


def make_edge_cases():
    # Shared formulas as Excel writes them (anchor cell + dependants), in both
    # Transitional and ISO Strict namespaces (Excel's "Strict Open XML" option).
    shared_formula_workbook("shared-formulas.xlsx", strict=False)
    shared_formula_workbook("strict-shared-formulas.xlsx", strict=True)

    # Minimal OLE2 compound files: only the header magic and directory entry
    # names matter to the reader's format identification.
    def cfb(*names):
        header = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\0" * 504
        return header + b"".join(n.encode("utf-16-le").ljust(64, b"\0") + b"\0" * 64 for n in names)

    with open(path("legacy.doc"), "wb") as handle:
        handle.write(cfb("Root Entry", "WordDocument", "1Table"))
    with open(path("legacy.xls"), "wb") as handle:
        handle.write(cfb("Root Entry", "Workbook"))
    # A password-protected .xlsx is an OLE2 container, not a ZIP package.
    with open(path("encrypted.xlsx"), "wb") as handle:
        handle.write(cfb("Root Entry", "EncryptionInfo", "EncryptedPackage"))

    # ZIP-level (legacy PKWARE) encryption: set the "encrypted" flag bit on
    # every member, in both local and central directory headers.
    data = bytearray()
    with open(path("uncalculated.xlsx"), "rb") as handle:
        data = bytearray(handle.read())
    for signature, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        start = 0
        while (start := data.find(signature, start)) != -1:
            data[start + offset] |= 0x1
            start += 4
    with open(path("zip-encrypted.xlsx"), "wb") as handle:
        handle.write(bytes(data))

    with open(path("report.docx"), "rb") as handle:
        whole = handle.read()
    with open(path("truncated.docx"), "wb") as handle:
        handle.write(whole[: len(whole) // 2])

    # A spreadsheet renamed to .docx: the reader follows content, not names.
    with open(path("budget.xlsx"), "rb") as source, open(path("misnamed-spreadsheet.docx"), "wb") as target:
        target.write(source.read())

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as package:
        package.writestr(zipfile.ZipInfo("mimetype", FIXED_TIME), "application/vnd.oasis.opendocument.text")
        package.writestr(zipfile.ZipInfo("content.xml", FIXED_TIME), "<office:document-content/>")
    with open(path("document.odt"), "wb") as handle:
        handle.write(buffer.getvalue())


if __name__ == "__main__":
    make_docx()
    make_pptx()
    make_xlsx()
    make_edge_cases()
    print("fixtures written to", HERE)
