export default {
  id: "source-link-status",
  name: "Details about the downloadURL link status of a distribution",
  jsonSchema: require("@magda/registry-aspects/source-link-status.schema.json")
};

export interface duplicateRecordsAspect {
  url: urlWrapper;
  ids: string[];
  errorDetails?: any;
}

export interface distURL {
  url?: string;
  type: "accessURL" | "downloadURL" | "none";
}

export interface urlWrapper {
  new(urls: distURL[]): urlWrapper;
  urls: distURL[];
}

export var urlWrapper: urlWrapper;

