import JsonTransformer, { JsonTransformerOptions } from '@magda/typescript-common/dist/JsonTransformer';
import {DatasetContainer} from '../../magda-typescript-common/src/JsonConnector'
import {Moment} from 'moment'

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

    getRetrievedAtFromDataset(dataset: DatasetContainer): Moment {
        return dataset.retrievedAt;
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
