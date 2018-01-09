import { Formats } from "@magda/typescript-common/src/format/formats"
export default {
  id: "dataset-format",
  name: "Details about the format of the distribution",
  jsonSchema: require("@magda/registry-aspects/dataset-format.schema.json")
};

export interface FormatAspect {
  format: Formats;
  confidenceLevel: confidencetype;
  errorDetails?: any;
}

export type confidencetype = number | "unknown";