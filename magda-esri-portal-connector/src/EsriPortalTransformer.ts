import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";
import JsonTransformer, {
    JsonTransformerOptions
} from "@magda/typescript-common/dist/JsonTransformer";

export default class EsriPortalTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonOrganization.id,
            "Organization",
            sourceId
        );
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(jsonDataset.id, "Dataset", sourceId);
    }

    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonDistribution.id,
            "Distribution",
            sourceId
        );
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.title || jsonOrganization.name;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return (
            jsonDistribution.title ||
            jsonDistribution.name ||
            jsonDistribution.id
        );
    }
}
