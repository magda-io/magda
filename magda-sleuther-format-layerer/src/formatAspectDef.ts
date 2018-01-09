import { Formats } from "@magda/typescript-common/src/format/formats"
export default {
  id: "dataset-summarizer",
  name: "Details about the downloadURL link status of a distribution",
  jsonSchema: require("@magda/registry-aspects/dataset-summarizer.schema.json")
};

export interface FormatAspect {
  format: Formats;
  confidenceLevel: confidencetype;
  errorDetails?: any;
}

export type confidencetype = number | "unknown";