import ConnectorRecordId from "magda-typescript-common/src/ConnectorRecordId";
import JsonTransformer, {
    JsonTransformerOptions
} from "magda-typescript-common/src/JsonTransformer";

export default class DapTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonOrganization.identifier,
            "Organization",
            sourceId
        );
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        return new ConnectorRecordId(
            jsonDataset.id.identifier,
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
            jsonDistribution.id || jsonDistribution.name,
            "Distribution",
            sourceId
        );
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name || jsonOrganization.title;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return jsonDistribution.name || jsonDistribution.id;
    }
}
