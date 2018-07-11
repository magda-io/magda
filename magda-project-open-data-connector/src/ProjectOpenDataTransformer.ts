import JsonTransformer, {
    JsonTransformerOptions
} from "@magda/typescript-common/dist/JsonTransformer";
import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";

export default class ProjectOpenDataTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonOrganization.name,
            "Organization",
            sourceId
        );
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonDataset.identifier,
            "Dataset",
            sourceId
        );
    }

    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            this.getRawDistributionId(jsonDistribution, jsonDataset),
            "Distribution",
            sourceId
        );
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return (
            jsonDistribution.title ||
            this.getRawDistributionId(jsonDistribution, jsonDataset)
        );
    }

    private getRawDistributionId(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return (
            jsonDataset.identifier +
            "-" +
            jsonDataset.distribution.indexOf(jsonDistribution)
        );
    }
}
