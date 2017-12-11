import JsonTransformer, { JsonTransformerOptions } from '@magda/typescript-common/dist/JsonTransformer';

export default class CkanTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.id;
    }

    getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.id;
    }

    getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.id;
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.display_name || jsonOrganization.title || jsonOrganization.name || jsonOrganization.id;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.name || jsonDistribution.id;
    }
}
