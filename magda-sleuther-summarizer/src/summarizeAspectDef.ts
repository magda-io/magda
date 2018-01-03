export default {
  id: "dataset-summarizer",
  name: "A written summary of any text base document",
  jsonSchema: require("@magda/registry-aspects/dataset-summarizer.schema.json")
};

export interface SummarizeAspect {
  status: RetrieveResult;
  errorDetails?: any,
  summary: Summary,
}

export type RetrieveResult = "isValid" | "unknown" | "isNotValid";
export type Summary = string;