import { Formats } from "./format-engine/formats"
export default {
  id: "distribution-format",
  name: "Details about the format of the distribution",
  jsonSchema: require("@magda/registry-aspects/dataset-format.schema.json")
};

export interface FormatAspect {
  format: Formats;
  errorDetails?: any;
}