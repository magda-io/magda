export default {
  id: "dataset-summarizer",
  name: "Details about the downloadURL link status of a distribution",
  jsonSchema: require("@magda/registry-aspects/dataset-summarizer.schema.json")
};

export interface SummarizeAspect {
  status: RetrieveResult;
  errorDetails?: any,
  summary: Summary,
}

export type RetrieveResult = "isValid" | "unknown" | "isNotValid";
export type Summary = string;