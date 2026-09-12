# Cataloguing remote/link distributions & making previews work

Read this when a **preview won't render**, or when cataloguing **remote/link
distributions** — datasets whose data lives at an external URL (ArcGIS/WMS/WFS
endpoints, remote CSV/JSON/API) rather than an uploaded file. Follow the ground
rules in `SKILL.md`. Getting such a distribution to **preview** (map /
table+chart / JSON records) in the web UI is dominated by one non-obvious fact:

> **The `dataset-format` aspect — not `dcat-distribution-strings.format` —
> governs both preview selection and the search index.** The web client reads the
> effective format from `dataset-format` first and only falls back to the DCAT
> `format`. `add-file --format` sets the **DCAT** format; when `magda-minion-format`
> is enabled it writes a `dataset-format` aspect that **overrides** it. So
> `--format csv` alone may be silently overridden and no table preview appears.

**To force the effective format, set the aspect** (confidence `100` beats the
minion's guess):

```sh
mgd dataset aspect set <distId> dataset-format '{"format":"csv","confidenceLevel":100}' --json
```

## Ordering & the minion re-clobber trap

`magda-minion-format` re-runs whenever `dcat-distribution-strings` changes and
re-derives `dataset-format` from URL/content sniffing — sometimes **wrongly**
(a `…DataDrillDataset.php?…&format=csv` endpoint got tagged `X-HTTPD-PHP` from the
server MIME; an ArcGIS `…/FeatureServer/0/query?f=geojson` endpoint got tagged
`ESRI FEATURESERVER` because the URL contains "FeatureServer", clobbering an
explicit `GEOJSON` — see magda-io/magda-minion-format#25).

So: **set `dataset-format` last**, after every `dcat-distribution-strings` edit.
Any later DCAT patch re-triggers the minion and can clobber it again. Confirm the
effective format stuck via the "Verifying changes" section below, not by assuming
one read is final.

## Format → preview matrix

The effective (`dataset-format`) value drives which preview renders:

| Preview | Effective format that triggers it | Notes |
| --- | --- | --- |
| **Table + chart** | matches `csv` as a whole word (`/(^\|\W+)csv(\W+\|$)/i`) | also needs a fetchable URL (see "remote direct files") and passes the proxy allow-list |
| **Map** | one of (in preference order) `WMS`, `ESRI MAPSERVER`, `WFS`, `ESRI FEATURESERVER`, `GeoJSON`, `csv-geo-au`, `KML`, `KMZ` | first match in that order wins |
| **JSON records** | JSON served at a fetchable URL | rendered by the JSON tree viewer on the distribution page |

**Map specifics:**

- **WMS with a working `GetCapabilities` is the most reliable map path.**
- **ArcGIS FeatureServer** must point at a *specific layer* (`…/FeatureServer/0`,
  not the service root) — and even then the current preview-map can fail to
  render it (magda-io/magda-preview-map#26). The reliable workaround is to add a
  **second GeoJSON distribution** pointing at the layer's query endpoint and
  classify it `GeoJSON`:

  ```sh
  GDIST=$(mgd dataset add-file <datasetId> \
    --access-url 'https://…/FeatureServer/0/query?where=1=1&outFields=*&f=geojson' \
    --title "… (GeoJSON)" --json | jq -r '.distributionId')
  mgd dataset aspect set "$GDIST" dataset-format '{"format":"GeoJSON","confidenceLevel":100}' --json
  ```

## "The preview says the file is there but nothing loads" (403 = proxy allow-list)

CSV/JSON/map previews fetch the remote URL **through the preview-map proxy**
(`/preview-map/proxy/`), which only proxies hosts whitelisted in
`magda-preview-map.serverConfig.allowProxyFor` (suffix match; defaults include
`gov.au`, `arcgis.com`, `csiro.au`). A source on a non-listed host (e.g.
`ala.org.au`, `gbif.org`) returns **403** and the preview stays empty. This is a
**deployment config** change (add the host to `allowProxyFor`), **not** a metadata
fix — tell the user that rather than fiddling with aspects.

## Remote direct-download files (downloadURL + license)

For a remote file the preview should fetch and render (e.g. a remote CSV), the
preview loader prefers **`downloadURL`**, but `add-file --access-url` only sets
`accessURL`; and `add-file` has **no `--license`**. The working recipe (note the
ordering — `dataset-format` last):

```sh
DIST=$(mgd dataset add-file <datasetId> --access-url 'https://host.gov.au/data.csv' --format csv --json | jq -r '.distributionId')
mgd dataset aspect patch "$DIST" dcat-distribution-strings '{"downloadURL":"https://host.gov.au/data.csv"}' --json
mgd dist update "$DIST" --license "CC-BY-4.0" --json
mgd dataset aspect set "$DIST" dataset-format '{"format":"csv","confidenceLevel":100}' --json  # set dataset-format last
```

## Default chart axes (`visualization-info`)

A CSV chart's default X/Y come from the `visualization-info` aspect. Without it
(and without the visualisation minion) the chart encoder guesses badly. Set
`timeseries` and per-field `{ "time" | "numeric" }` flags, with keys **matching
the CSV headers exactly**:

```sh
mgd dataset aspect set <distId> visualization-info \
  '{"timeseries":true,"fields":{"Date":{"time":true},"Rainfall_mm":{"numeric":true}}}' --json
```

`preview-tabular-data-settings` (`{"enableChart":bool,"enableTable":bool}`) force
the chart/table previews on or off independently.

## Resolving the id of a just-added distribution

`mgd dataset add-file --json` returns the new id in the **`distributionId`**
field (and in plain mode it prints the id to stdout), so capture it directly:

```sh
DIST=$(mgd dataset add-file <datasetId> --access-url 'https://host.gov.au/data.csv' --format csv --json | jq -r '.distributionId')
```

Fallback only if you've lost it — re-list and match on the URL you added:

```sh
mgd dataset distributions <datasetId> --jsonl \
  | jq -r 'select(.aspects["dcat-distribution-strings"].accessURL=="https://host.gov.au/data.csv") | .id'
```

## Verifying changes

- **State** lives in the `publishing` aspect — check it directly; search hitCount
  and admin-visible drafts don't prove published state.
- **Drafts aren't in the public search index** — only published datasets are. To
  confirm the effective format on a *draft*, read the registry aspect directly:

  ```sh
  mgd dist get <distId> --json | jq -r '.aspects["dataset-format"].format'
  ```

  Bear in mind `magda-minion-format` may still re-derive `dataset-format`
  asynchronously (the re-clobber trap above), so re-read after a moment if a DCAT
  edit could have re-triggered it.
- **Once published**, the **search index lags the registry** after any mutation —
  the delay ranges from seconds to a few minutes depending on the deployment's
  indexer schedule, so poll (don't assume one read is final) to confirm what
  previews actually read (they use the indexed effective value):

  ```sh
  mgd search datasets "<dataset title>" --jsonl | jq -r 'select(.identifier=="<datasetId>") | .distributions[].format'
  ```
