import * as _ from "lodash";

import { getRegistry } from "@magda/sleuther-framework/src/index";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import unionToThrowable from "@magda/typescript-common/dist/util/unionToThrowable";
import linkedDataAspectDef from "./linkedDataAspectDef";
import datasetQualityAspectDef from "./linkedDataAspectDef";

const OPEN_LICENSES = ["Creative Commons", "PDDL", "ODC"];
const FORMAT_STARS: { [stars: number]: string[] } = {
  2: ["xls", "xlsx", "mdb", "esri rest"],
  3: [
    "csv",
    "wms",
    "geojson",
    "wfs",
    "kml",
    "kmz",
    "json",
    "xml",
    "shp",
    "rss",
    "gpx",
    "tsv"
  ],
  4: ["csv-geo-au", "sparql", "rdf", "json-ld"]
};
const registry = getRegistry();

export default async function onRecordFound(record: Record) {
  const distributions = _(
    record.aspects["dataset-distributions"]
      ? record.aspects["dataset-distributions"].distributions
      : []
  )
    .flatMap((distribution: Record) => distribution.aspects)
    .flatMap((aspect: any) => aspect["dcat-distribution-strings"])
    .value();

  const processed = distributions.map(distribution => {
    const isLicenseOpen = isOpenLicense(distribution.license);

    if (isLicenseOpen) {
      return starsForFormat(distribution.format);
    } else {
      return 0;
    }
  });

  const best = _.max(processed) || 0;

  const starsAspectPromise = registry
    .putRecordAspect(record.id, linkedDataAspectDef.id, {
      stars: best || 0
    })
    .then(result => unionToThrowable(result));

  const op = {
    op: "add",
    path: "/" + linkedDataAspectDef.id,
    value: {
      score: best / 5,
      weighting: 0.8
    }
  };

  const qualityPromise = registry
    .patchRecordAspect(record.id, datasetQualityAspectDef.id, [op])
    .then(result => unionToThrowable(result));

  await Promise.all([starsAspectPromise, qualityPromise]);
}

const lowerCaseOpenLicenses = lowerCaseify(OPEN_LICENSES);
function isOpenLicense(license: String): boolean {
  const lowerCase = license ? license.toLowerCase() : "";

  return lowerCaseOpenLicenses.some(
    openLicense => lowerCase.indexOf(openLicense) >= 0
  );
}

const formatStarsLookup = _(FORMAT_STARS)
  .toPairs()
  .flatMap(([stars, formats]: [string, string[]]) =>
    formats.map(format => [format.toLowerCase(), parseInt(stars)])
  )
  .fromPairs()
  .value();

function starsForFormat(format: String): number {
  return (format && formatStarsLookup[format.toLowerCase()]) || 1;
}

function lowerCaseify(strings: string[]): string[] {
  return strings.map(license => license.toLowerCase());
}
