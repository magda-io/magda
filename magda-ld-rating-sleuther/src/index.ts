import Registry from "@magda/typescript-common/dist/Registry";
import { Record } from "@magda/typescript-common/dist/generated/registry/api";
import sleuther from "./library/sleuther";

const datasetAspectDef = {
  id: "dataset-linked-data-rating",
  name:
    "Details about how well the dataset is using linked data, as per Tim Berners-Lee at https://www.w3.org/DesignIssues/LinkedData.html",
  jsonSchema: require("@magda/registry-aspects/dataset-linked-data-rating.schema.json")
};
const ID = "ld-rating-sleuther";
const host = process.env.HOST || ID;

const registry = new Registry({
  baseUrl:
    process.env.REGISTRY_URL ||
    process.env.npm_package_config_registryUrl ||
    "http://localhost:6100/v0"
});

function unionToThrowable<T>(input: T | Error): T {
  if (<Error>input) {
    throw <Error>input;
  } else {
    return <T>input;
  }
}

function sleuthLinkedData(registry: Registry) {
  function onRecordFound(record: Record): Promise<void> {
    return registry
      .putRecordAspect(record.id, "source-link-status", {
        stars: 4
      })
      .then(result => unionToThrowable(result))
      .then(_ => null);
  }

  sleuther({
    registry,
    host,
    id: ID,
    aspects: ["dcat-dataset-strings"],
    optionalAspects: [],
    writeAspectDefs: [datasetAspectDef],
    onRecordFound
  });
}

sleuthLinkedData(registry);
