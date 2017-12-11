import JsonTransformer, { JsonTransformerOptions } from '@magda/typescript-common/dist/JsonTransformer';
import * as crypto from 'crypto';
import * as jsonpath from 'jsonpath';
import {DatasetContainer} from 'aspect-templates/../../magda-typescript-common/src/JsonConnector'
import {Moment} from 'moment'

export default class CswTransformer extends JsonTransformer {
    constructor(options: JsonTransformerOptions) {
        super(options);
    }

    getIdFromJsonOrganization(jsonOrganization: any): string {
        const name = this.getNameFromJsonOrganization(jsonOrganization);
        const id = name && name.length > 100 ? crypto.createHash('sha256').update(name, 'utf8').digest('hex') : name;
        return id
    }

    getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.json.fileIdentifier[0].CharacterString[0]._;
    }

    getRetrievedAtFromDataset(datasetContainer: DatasetContainer): Moment {
        return datasetContainer.retrievedAt;
    }

    getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return this.getIdFromJsonDataset(jsonDataset) + '-' + this.getJsonDistributionsArray(jsonDataset).indexOf(jsonDistribution);
    }

    getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonpath.value(jsonOrganization, '$.organisationName[0].CharacterString[0]._');
    }

    getNameFromJsonDataset(jsonDataset: any): string {
        const dataIdentification = jsonpath.query(jsonDataset.json, '$.identificationInfo[*].MD_DataIdentification[*].dataIdentification[*]');
        const serviceIdentification = jsonpath.query(jsonDataset.json, '$.identificationInfo[*].SV_ServiceIdentification[*].serviceIdentification[*]');
        const identification = dataIdentification || serviceIdentification || {};
        const title = jsonpath.value(identification, '$.citation[*].CI_Citation[*].title[*].CharacterString[*]._') || this.getIdFromJsonDataset(jsonDataset);
        return title;
    }

    getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        const name = jsonpath.value(jsonDistribution, '$.name[*].CharacterString[*]._');
        const description = jsonpath.value(jsonDistribution, '$.description[*].CharacterString[*]._');
        return name || description || this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
    }

    private getJsonDistributionsArray(dataset: any): any[] {
        return jsonpath.query(dataset.json, '$.distributionInfo[*].MD_Distribution[*].transferOptions[*].MD_DigitalTransferOptions[*].onLine[*].CI_OnlineResource[*]');
    }
}
