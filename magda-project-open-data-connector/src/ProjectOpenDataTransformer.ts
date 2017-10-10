import JsonTransformer, { JsonTransformerOptions } from '@magda/typescript-common/dist/JsonTransformer';

export default class ProjectOpenDataTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name;
    }

    getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.identifier;
    }

    getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDataset.identifier + '-' + jsonDataset.distribution.indexOf(jsonDistribution);
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name;
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title;
    }

    getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.title || this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
    }
}
