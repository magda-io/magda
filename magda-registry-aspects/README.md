### Magda Registry Aspects Json Schemas

This package includes all built-in [Magda](https://github.com/magda-io/magda) registry Aspects Json Schemas:

- access.schema.json
- ckan-dataset.schema.json
- ckan-resource.schema.json
- csv-dataset.schema.json
- information-security.schema.json
- csw-dataset.schema.json
- organization-details.schema.json
- csw-distribution.schema.json
- currency.schema.json
- project-open-data-dataset.schema.json
- dap-dataset.schema.json
- project-open-data-distribution.schema.json
- dap-resource.schema.json
- project.schema.json
- access-control.schema.json (previously `dataset-access-control` aspect)
- provenance.schema.json
- dataset-distributions.schema.json
- publishing.schema.json
- dataset-format.schema.json
- source-link-status.schema.json
- dataset-linked-data-rating.schema.json
- source.schema.json
- dataset-publisher.schema.json
- spatial-coverage.schema.json
- dataset-quality-rating.schema.json
- temporal-coverage.schema.json
- data-dictionary.schema.json (distribution records): normalized, provenance-aware data dictionary (entities, fields, keys, relationships, dimensions). See the [design](../docs/design/data-dictionary-design.md), the [authoring guide](../docs/docs/data-dictionary.md) and the [example payloads](./examples/data-dictionary/) for the documented v1 source families (CSV, multi-sheet Excel, OpenAPI request/response, ArcGIS feature layer, relational composite keys, Parquet/Arrow, NetCDF/Zarr, mixed-origin manual overrides, reserved-character paths).
- distribution-contract.schema.json (distribution records): normalized, provenance-aware description of how a distribution can be accessed or queried (protocol, endpoint, native specification, descriptive authentication, operations, scalar parameters, request/response references to `data-dictionary` entities, pagination hints, source capabilities). Descriptive metadata only: never credentials, never execution authority. See the [design](../docs/design/distribution-contract-design.md), the [authoring guide](../docs/docs/distribution-contract.md) and the [example payloads](./examples/distribution-contract/) for the documented v1 source families (HTTP download, REST/OpenAPI, ArcGIS Feature Service, OGC API/STAC, authenticated/restricted service, mixed-origin provenance).

Built-in aspect definitions are discovered automatically by `magda-migrator-registry-aspects` from the `*.schema.json` files in this package: adding a schema file is enough to register a new built-in aspect.
