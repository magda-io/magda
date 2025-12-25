# magda-local-deployment

![Version: 5.6.0](https://img.shields.io/badge/Version-5.6.0-informational?style=flat-square)

## Requirements

Kubernetes: `>= 1.14.0-0`

| Repository | Name | Version |
|------------|------|---------|
| file://../magda | magda | 5.6.0 |
| oci://ghcr.io/magda-io/charts | magda-auth-arcgis | 2.0.1 |
| oci://ghcr.io/magda-io/charts | magda-auth-facebook | 2.0.0 |
| oci://ghcr.io/magda-io/charts | magda-auth-google | 3.0.0 |
| oci://ghcr.io/magda-io/charts | magda-auth-internal | 3.0.0 |
| oci://ghcr.io/magda-io/charts | connector-nsw(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-dga(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-ditrdca(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-wa(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-vic(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-sa(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-aurin(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-qld(magda-ckan-connector) | 2.1.0 |
| oci://ghcr.io/magda-io/charts | connector-aodn(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-listtas(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-ga(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-aims(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-tern(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-marlin(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-mrt(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-bom(magda-csw-connector) | 2.0.2 |
| oci://ghcr.io/magda-io/charts | connector-dap(magda-dap-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-actmapi(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-vic-cardinia(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-melbourne(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-melbournewater(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-logan(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-launceston(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-hobart(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-moretonbay(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-nt-darwin(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-southern-grampians(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-bundaberg(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-act(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-dcceew(magda-project-open-data-connector) | 2.0.0 |
| oci://ghcr.io/magda-io/charts | connector-redland(magda-project-open-data-connector) | 2.0.0 |

## Values

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| connector-act.config.id | string | `"act"` |  |
| connector-act.config.name | string | `"ACT Government data.act.gov.au"` |  |
| connector-act.config.schedule | string | `"0 0 */3 * *"` |  |
| connector-act.config.sourceUrl | string | `"https://www.data.act.gov.au/data.json"` |  |
| connector-actmapi.config.id | string | `"actmapi"` |  |
| connector-actmapi.config.name | string | `"ACT Government ACTMAPi"` |  |
| connector-actmapi.config.schedule | string | `"45 0 */3 * *"` |  |
| connector-actmapi.config.sourceUrl | string | `"https://actmapi-actgov.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-aims.config.id | string | `"aims"` |  |
| connector-aims.config.name | string | `"Australian Institute of Marine Science"` |  |
| connector-aims.config.outputSchema | string | `"http://standards.iso.org/iso/19115/-3/mdb/2.0"` |  |
| connector-aims.config.pageSize | int | `100` |  |
| connector-aims.config.sourceUrl | string | `"https://geonetwork.apps.aims.gov.au/geonetwork/srv/eng/csw"` |  |
| connector-aims.config.typeNames | string | `"mdb:MD_Metadata"` |  |
| connector-aodn.config.id | string | `"aodn"` |  |
| connector-aodn.config.name | string | `"Australian Oceans Data Network"` |  |
| connector-aodn.config.outputSchema | string | `"http://standards.iso.org/iso/19115/-3/mdb/2.0"` |  |
| connector-aodn.config.pageSize | int | `100` |  |
| connector-aodn.config.sourceUrl | string | `"https://catalogue.aodn.org.au/geonetwork/srv/eng/csw"` |  |
| connector-aodn.config.typeNames | string | `"mdb:MD_Metadata"` |  |
| connector-aurin.config.id | string | `"aurin"` |  |
| connector-aurin.config.name | string | `"Australian Urban Research Infrastructure Network"` |  |
| connector-aurin.config.pageSize | int | `100` |  |
| connector-aurin.config.schedule | string | `"0 1 */3 * *"` |  |
| connector-aurin.config.sourceUrl | string | `"https://data.aurin.org.au/"` |  |
| connector-bom.config.id | string | `"bom"` |  |
| connector-bom.config.name | string | `"Bureau of Meteorology"` |  |
| connector-bom.config.pageSize | int | `100` |  |
| connector-bom.config.sourceUrl | string | `"http://www.bom.gov.au/geonetwork/srv/eng/csw"` |  |
| connector-bundaberg.config.id | string | `"bundaberg"` |  |
| connector-bundaberg.config.name | string | `"Bundaberg Regional Council"` |  |
| connector-bundaberg.config.presetRecordAspects[0].data.jurisdiction | string | `"Queensland Government"` |  |
| connector-bundaberg.config.presetRecordAspects[0].data.title | string | `"Bundaberg Regional Council"` |  |
| connector-bundaberg.config.presetRecordAspects[0].id | string | `"organization-details"` |  |
| connector-bundaberg.config.presetRecordAspects[0].opType | string | `"MERGE_RIGHT"` |  |
| connector-bundaberg.config.presetRecordAspects[0].recordType | string | `"Organization"` |  |
| connector-bundaberg.config.presetRecordAspects[1].data.publisher | string | `"Bundaberg Regional Council"` |  |
| connector-bundaberg.config.presetRecordAspects[1].id | string | `"dcat-dataset-strings"` |  |
| connector-bundaberg.config.presetRecordAspects[1].opType | string | `"MERGE_RIGHT"` |  |
| connector-bundaberg.config.presetRecordAspects[1].recordType | string | `"Dataset"` |  |
| connector-bundaberg.config.schedule | string | `"30 13 * * *"` |  |
| connector-bundaberg.config.sourceUrl | string | `"https://opendata-bundabergrc.hub.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-dap.config.id | string | `"dap"` |  |
| connector-dap.config.name | string | `"CSIRO"` |  |
| connector-dap.config.pageSize | int | `100` |  |
| connector-dap.config.presetRecordAspects[0].data.jurisdiction | string | `"Australian Government"` |  |
| connector-dap.config.presetRecordAspects[0].data.title | string | `"CSIRO"` |  |
| connector-dap.config.presetRecordAspects[0].id | string | `"organization-details"` |  |
| connector-dap.config.presetRecordAspects[0].recordType | string | `"Organization"` |  |
| connector-dap.config.schedule | string | `"20 15 * * *"` |  |
| connector-dap.config.sourceUrl | string | `"https://data.csiro.au/dap/ws/v2/"` |  |
| connector-dcceew.config.id | string | `"dcceew"` |  |
| connector-dcceew.config.name | string | `"Department of Climate Change, Energy, the Environment and Water"` |  |
| connector-dcceew.config.schedule | string | `"10 13 * * 6"` |  |
| connector-dcceew.config.sourceUrl | string | `"https://fed.dcceew.gov.au/api/feed/dcat-us/1.1.json"` |  |
| connector-dga.config.id | string | `"dga"` |  |
| connector-dga.config.ignoreHarvestSources[0] | string | `"*"` |  |
| connector-dga.config.name | string | `"data.gov.au"` |  |
| connector-dga.config.pageSize | int | `100` |  |
| connector-dga.config.sourceUrl | string | `"https://data.gov.au/data/"` |  |
| connector-ditrdca.config.id | string | `"ditrdca"` |  |
| connector-ditrdca.config.ignoreHarvestSources[0] | string | `"No"` |  |
| connector-ditrdca.config.name | string | `"Department of infrastructure"` |  |
| connector-ditrdca.config.pageSize | int | `25` |  |
| connector-ditrdca.config.schedule | string | `"55 13 * * *"` |  |
| connector-ditrdca.config.sourceUrl | string | `"https://catalogue.data.infrastructure.gov.au/"` |  |
| connector-ga.config.id | string | `"ga"` |  |
| connector-ga.config.name | string | `"Geoscience Australia"` |  |
| connector-ga.config.outputSchema | string | `"http://standards.iso.org/iso/19115/-3/mdb/2.0"` |  |
| connector-ga.config.pageSize | int | `100` |  |
| connector-ga.config.schedule | string | `"0 5 */3 * *"` |  |
| connector-ga.config.sourceUrl | string | `"https://ecat.ga.gov.au/geonetwork/srv/eng/csw"` |  |
| connector-ga.config.typeNames | string | `"mdb:MD_Metadata"` |  |
| connector-gbrmpa.config.id | string | `"gbrmpa"` |  |
| connector-gbrmpa.config.name | string | `"GBRMPA Geoportal"` |  |
| connector-gbrmpa.config.schedule | string | `"30 15 */3 * *"` |  |
| connector-gbrmpa.config.sourceUrl | string | `"https://geoportal.gbrmpa.gov.au/api/feed/dcat-us/1.1.json"` |  |
| connector-hobart.config.id | string | `"hobart"` |  |
| connector-hobart.config.name | string | `"City of Hobart Open Data Portal"` |  |
| connector-hobart.config.schedule | string | `"30 2 */3 * *"` |  |
| connector-hobart.config.sourceUrl | string | `"https://data-1-hobartcc.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-launceston.config.id | string | `"launceston"` |  |
| connector-launceston.config.name | string | `"City of Launceston Open Data"` |  |
| connector-launceston.config.schedule | string | `"0 3 */3 * *"` |  |
| connector-launceston.config.sourceUrl | string | `"https://opendata.launceston.tas.gov.au/api/feed/dcat-us/1.1.json"` |  |
| connector-listtas.config.id | string | `"listtas"` |  |
| connector-listtas.config.name | string | `"Tasmania TheList"` |  |
| connector-listtas.config.pageSize | int | `100` |  |
| connector-listtas.config.schedule | string | `"30 10 */3 * *"` |  |
| connector-listtas.config.sourceUrl | string | `"https://data.thelist.tas.gov.au:443/datagn/srv/eng/csw"` |  |
| connector-logan.config.id | string | `"logan"` |  |
| connector-logan.config.name | string | `"Logan City Council"` |  |
| connector-logan.config.schedule | string | `"30 5 */3 * *"` |  |
| connector-logan.config.sourceUrl | string | `"https://data-logancity.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-marlin.config.id | string | `"marlin"` |  |
| connector-marlin.config.name | string | `"CSIRO Marlin"` |  |
| connector-marlin.config.outputSchema | string | `"http://standards.iso.org/iso/19115/-3/mdb/2.0"` |  |
| connector-marlin.config.pageSize | int | `50` |  |
| connector-marlin.config.schedule | string | `"30 3 */3 * *"` |  |
| connector-marlin.config.sourceUrl | string | `"https://marlin.csiro.au/geonetwork/srv/eng/csw"` |  |
| connector-marlin.config.typeNames | string | `"mdb:MD_Metadata"` |  |
| connector-melbourne.config.id | string | `"melbourne"` |  |
| connector-melbourne.config.name | string | `"Melbourne Data"` |  |
| connector-melbourne.config.schedule | string | `"0 6 */3 * *"` |  |
| connector-melbourne.config.sourceUrl | string | `"https://data.melbourne.vic.gov.au/data.json"` |  |
| connector-melbournewater.config.id | string | `"melbournewater"` |  |
| connector-melbournewater.config.name | string | `"Melbourne Water Corporation"` |  |
| connector-melbournewater.config.schedule | string | `"30 4 */3 * *"` |  |
| connector-melbournewater.config.sourceUrl | string | `"https://data-melbournewater.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-moretonbay.config.id | string | `"moretonbay"` |  |
| connector-moretonbay.config.name | string | `"Moreton Bay Regional Council Data Portal"` |  |
| connector-moretonbay.config.schedule | string | `"0 7 */3 * *"` |  |
| connector-moretonbay.config.sourceUrl | string | `"https://datahub.moretonbay.qld.gov.au/api/feed/dcat-us/1.1.json"` |  |
| connector-mrt.config.id | string | `"mrt"` |  |
| connector-mrt.config.name | string | `"Mineral Resources Tasmania"` |  |
| connector-mrt.config.pageSize | int | `100` |  |
| connector-mrt.config.schedule | string | `"30 6 */3 * *"` |  |
| connector-mrt.config.sourceUrl | string | `"http://www.mrt.tas.gov.au/web-catalogue/srv/eng/csw"` |  |
| connector-nsw.config.id | string | `"nsw"` |  |
| connector-nsw.config.name | string | `"New South Wales Government"` |  |
| connector-nsw.config.pageSize | int | `100` |  |
| connector-nsw.config.sourceUrl | string | `"https://data.nsw.gov.au/data/"` |  |
| connector-nt-darwin.config.id | string | `"nt-darwin"` |  |
| connector-nt-darwin.config.name | string | `"City of Darwin"` |  |
| connector-nt-darwin.config.schedule | string | `"0 12 */3 * *"` |  |
| connector-nt-darwin.config.sourceUrl | string | `"https://open-darwin.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-qld.config.id | string | `"qld"` |  |
| connector-qld.config.name | string | `"Queensland Government"` |  |
| connector-qld.config.pageSize | int | `100` |  |
| connector-qld.config.sourceUrl | string | `"https://data.qld.gov.au/"` |  |
| connector-redland.config.id | string | `"redland"` |  |
| connector-redland.config.name | string | `"Redland City Council"` |  |
| connector-redland.config.schedule | string | `"10 12 * * 6"` |  |
| connector-redland.config.sourceUrl | string | `"https://opendata.redland.qld.gov.au/api/feed/dcat-us/1.1.json"` |  |
| connector-sa.config.id | string | `"sa"` |  |
| connector-sa.config.name | string | `"South Australia Government"` |  |
| connector-sa.config.pageSize | int | `100` |  |
| connector-sa.config.sourceUrl | string | `"https://data.sa.gov.au/data/"` |  |
| connector-southern-grampians.config.id | string | `"southern-grampians"` |  |
| connector-southern-grampians.config.name | string | `"Southern Grampians Shire Council"` |  |
| connector-southern-grampians.config.schedule | string | `"30 12 */3 * *"` |  |
| connector-southern-grampians.config.sourceUrl | string | `"https://www.connectgh.com.au/data.json"` |  |
| connector-tern.config.id | string | `"tern"` |  |
| connector-tern.config.name | string | `"Terrestrial Ecosystem Research Network"` |  |
| connector-tern.config.outputSchema | string | `"http://standards.iso.org/iso/19115/-3/mdb/2.0"` |  |
| connector-tern.config.pageSize | int | `100` |  |
| connector-tern.config.schedule | string | `"0 11 */3 * *"` |  |
| connector-tern.config.sourceUrl | string | `"https://geonetwork.tern.org.au/geonetwork/srv/eng/csw"` |  |
| connector-tern.config.typeNames | string | `"mdb:MD_Metadata"` |  |
| connector-vic-cardinia.config.id | string | `"vic-cardinia"` |  |
| connector-vic-cardinia.config.name | string | `"Cardinia Shire Council"` |  |
| connector-vic-cardinia.config.schedule | string | `"30 11 * * *"` |  |
| connector-vic-cardinia.config.sourceUrl | string | `"https://data-cscgis.opendata.arcgis.com/api/feed/dcat-us/1.1.json"` |  |
| connector-vic.config.id | string | `"vic"` |  |
| connector-vic.config.ignoreHarvestSources | list | `[]` |  |
| connector-vic.config.name | string | `"Victoria Government"` |  |
| connector-vic.config.pageSize | int | `100` |  |
| connector-vic.config.presetRecordAspects[0].data.jurisdiction | string | `"Victoria Government"` |  |
| connector-vic.config.presetRecordAspects[0].data.title | string | `"Victoria Government"` |  |
| connector-vic.config.presetRecordAspects[0].id | string | `"organization-details"` |  |
| connector-vic.config.presetRecordAspects[0].recordType | string | `"Organization"` |  |
| connector-vic.config.schedule | string | `"50 * * * *"` |  |
| connector-vic.config.sourceUrl | string | `"https://discover.data.vic.gov.au/"` |  |
| connector-wa.config.customJsFilterCode | string | `"if(type === \"Dataset\") {\n  return jsonData[\"access_level\"]==\"open\" ? true : false;\n} else {\n  return true;\n}\n"` |  |
| connector-wa.config.id | string | `"wa"` |  |
| connector-wa.config.name | string | `"Western Australia Government"` |  |
| connector-wa.config.pageSize | int | `25` |  |
| connector-wa.config.sourceUrl | string | `"https://catalogue.data.wa.gov.au/"` |  |
| magda-auth-arcgis.arcgisClientId | string | `"d0MgVUbbg5Z6vmWo"` |  |
| magda-auth-arcgis.arcgisInstanceBaseUrl | string | `"https://www.arcgis.com"` |  |
| magda-auth-facebook.clientId | string | `"173073926555600"` |  |
| magda-auth-google.googleClientId | string | `"569942545102-7nu303pchs9n2vlgl435trcb6vr51ged.apps.googleusercontent.com"` |  |
| magda-auth-internal.authPluginConfig.loginFormExtraInfoContent | string | `"Forgot your password? Email [magda-test@googlegroups.com](magda-test@googlegroups.com)"` |  |
| magda.magda-core.registry-api.validateJsonSchema | bool | `false` |  |

----------------------------------------------
Autogenerated from chart metadata using [helm-docs v1.13.1](https://github.com/norwoodj/helm-docs/releases/v1.13.1)
