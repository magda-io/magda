export default {
    id: "source-link-status",
    name: "Details about the downloadURL link status of a distribution",
    jsonSchema: require("@magda/registry-aspects/source-link-status.schema.json")
};

export interface BrokenLinkAspect {
    status: RetrieveResult;
    httpStatusCode?: number;
    errorDetails?: any;
}

export type RetrieveResult = "active" | "unknown" | "broken";
