export default {
  id: "source-duplicate-collection",
  name: "Details about the downloadURL link status of a distribution",
  jsonSchema: require("@magda/registry-aspects/source-link-status.schema.json")
};

export interface DuplicateRecordsAspect {
  url: string;
  ids: string[];
  errorDetails?: any;
}

export interface DistURL {
  url?: string;
  type: "accessURL" | "downloadURL" | "none";
}