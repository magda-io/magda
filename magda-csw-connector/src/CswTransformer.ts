import JsonTransformer, {
    JsonTransformerOptions
} from "@magda/typescript-common/dist/JsonTransformer";
import * as jsonpath from "jsonpath";
import ConnectorRecordId from "@magda/typescript-common/dist/ConnectorRecordId";

export default class CswTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(
        jsonOrganization: any,
        sourceId: string
    ): ConnectorRecordId {
        const name = this.getNameFromJsonOrganization(jsonOrganization);
        return name && name.length > 0
            ? new ConnectorRecordId(name, "Organization", sourceId)
            : undefined;
    }

    getIdFromJsonDataset(
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        const id = this.getRawDatasetId(jsonDataset);
        return id && id.length > 0
            ? new ConnectorRecordId(id, "Dataset", sourceId)
            : undefined;
    }

    getIdFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any,
        sourceId: string
    ): ConnectorRecordId {
        const id = this.getRawDistributionId(jsonDistribution, jsonDataset);
        return id && id.length > 0
            ? new ConnectorRecordId(id, "Distribution", sourceId)
            : undefined;
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonpath.value(
            jsonOrganization,
            "$.organisationName[0].CharacterString[0]._"
        );
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        const dataIdentification = jsonpath.query(
            jsonDataset.json,
            "$.identificationInfo[*].MD_DataIdentification[*].dataIdentification[*]"
        );
        const serviceIdentification = jsonpath.query(
            jsonDataset.json,
            "$.identificationInfo[*].SV_ServiceIdentification[*].serviceIdentification[*]"
        );
        const identification =
            dataIdentification || serviceIdentification || {};
        const title =
            jsonpath.value(
                identification,
                "$.citation[*].CI_Citation[*].title[*].CharacterString[*]._"
            ) || this.getRawDatasetId(jsonDataset);
        return title;
    }

    getNameFromJsonDistribution(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        const name = jsonpath.value(
            jsonDistribution,
            "$.name[*].CharacterString[*]._"
        );
        const description = jsonpath.value(
            jsonDistribution,
            "$.description[*].CharacterString[*]._"
        );
        return (
            name ||
            description ||
            this.getRawDistributionId(jsonDistribution, jsonDataset)
        );
    }

    private getJsonDistributionsArray(dataset: any): any[] {
        return jsonpath.query(
            dataset.json,
            "$.distributionInfo[*].MD_Distribution[*].transferOptions[*].MD_DigitalTransferOptions[*].onLine[*].CI_OnlineResource[*]"
        );
    }

    private getRawDatasetId(jsonDataset: any): string {
        return jsonDataset.json.fileIdentifier[0].CharacterString[0]._;
    }

    private getRawDistributionId(
        jsonDistribution: any,
        jsonDataset: any
    ): string {
        return (
            this.getRawDatasetId(jsonDataset) +
            "-" +
            this.getJsonDistributionsArray(jsonDataset).indexOf(
                jsonDistribution
            )
        );
    }
}
