import sleuther from "@magda/sleuther-framework/dist/index";
import onRecordFound from "./onRecordFound";
import brokenLinkAspectDef from "./brokenLinkAspectDef";
import datasetQualityAspectDef from "@magda/sleuther-framework/dist/common-aspect-defs/datasetQualityAspectDef";

const ID = "sleuther-broken-link";
const host = process.env.HOST || ID;

export default async function sleuthBrokenLinks() {
  return await sleuther({
    host,
    id: ID,
    defaultPort: 6111,
    aspects: ["dataset-distributions"],
    optionalAspects: [],
    async: true,
    writeAspectDefs: [brokenLinkAspectDef, datasetQualityAspectDef],
    onRecordFound: record =>
      onRecordFound(
        record,
        process.env.RETRIES && parseInt(process.env.RETRIES)
      )
  });
}
