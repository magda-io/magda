export default {
    id: "dataset-format",
    name: "Details about the format of the distribution",
    jsonSchema: require("@magda/registry-aspects/dataset-format.schema.json"),
    tenantId: "tenant id in number string"
};

export interface FormatAspect {
    format: string;
    confidenceLevel: confidencetype;
    errorDetails?: any;
}

export type confidencetype = number | "unknown";
