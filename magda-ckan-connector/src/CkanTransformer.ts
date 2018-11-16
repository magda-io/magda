import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";
import JsonTransformer, {
    JsonTransformerOptions
} from "@magda/typescript-common/dist/JsonTransformer";
import { Record } from "@magda/typescript-common/src/generated/registry/api";

export default class CkanTransformer extends JsonTransformer {
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
        return (
            jsonOrganization.display_name ||
            jsonOrganization.title ||
            jsonOrganization.name ||
            jsonOrganization.id
        );
    }

    reviseOrganizationRecord(record: Record): Record {
        if (
            record.aspects["organization-details"] &&
            record.aspects["organization-details"].description ===
                "A little information about my organization..."
        ) {
            record.aspects["organization-details"].description = "";
        }

        return record;
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
