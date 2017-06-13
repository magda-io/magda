import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import JsonConnector, { JsonConnectorOptions } from '@magda/typescript-common/lib/JsonConnector';
import Csw from './Csw';
import { flatMap } from 'lodash';
import * as xmldom from 'xmldom';
import * as xml2js from 'xml2js';
import * as jsonpath from 'jsonpath';
import { groupBy } from 'lodash';
import * as crypto from 'crypto';

export default class CswConnector extends JsonConnector {
    private readonly csw: Csw;
    private readonly xmlSerializer = new xmldom.XMLSerializer();

    constructor(options: CswConnectorOptions) {
        super(options);
        this.csw = options.source;
    }

    protected getJsonDatasetPublisher(dataset: any): any {
        // Find all parties that are publishers, owners, or custodians.
        const responsibleParties = jsonpath.query(dataset.json, '$..CI_ResponsibleParty[*]');
        const byRole = groupBy(responsibleParties, party => jsonpath.value(party, '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'));
        const datasetOrgs = byRole.publisher || byRole.owner || byRole.custodian;
        if (!datasetOrgs || datasetOrgs.length === 0) {
            return undefined;
        }

        const datasetOrg = datasetOrgs[0];
        if (this.getIdFromJsonOrganization(datasetOrg) === undefined) {
            return undefined;
        }

        return datasetOrg;
    }

    protected getJsonOrganizations(): AsyncPage<any[]> {
        // Enumerate organizations along with the datasets using getJsonDatasetPublisher rather than up front in this function,
        // because the latter would require an extra pass through all the CSW records.
        return AsyncPage.none<any[]>();
    }

    protected getJsonDatasets(): AsyncPage<any[]> {
        const recordPages = this.csw.getRecords();
        return recordPages.map(pageXml => {
            const searchResults = pageXml.documentElement.getElementsByTagNameNS('*', 'SearchResults')[0];
            const records = searchResults.getElementsByTagNameNS('*', 'MD_Metadata');

            const result = [];

            for (let i = 0; i < records.length; ++i) {
                const recordXml = records.item(i);

                const xml2jsany: any = xml2js; // needed because the current TypeScript declarations don't know about xml2js.processors.
                const parser = new xml2js.Parser({
                    xmlns: true,
                    tagNameProcessors: [ xml2jsany.processors.stripPrefix ],
                    async: false,
                    explicitRoot: false
                });

                const xmlString = this.xmlSerializer.serializeToString(recordXml);
                let json: any = {};
                parser.parseString(xmlString, function(error: any, result: any) {
                    if (error) {
                        return;
                    }
                    json = result;
                });

                result.push({
                    json: json,
                    xml: recordXml,
                    xmlString: xmlString
                });
            }

            return result;
        });
    }

    protected getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(this.getJsonDistributionsArray(dataset));
    }

    private getJsonDistributionsArray(dataset: any): any[] {
        return jsonpath.query(dataset.json, '$.distributionInfo[*].MD_Distribution[*].transferOptions[*].MD_DigitalTransferOptions[*].onLine[*].CI_OnlineResource[*]');
    }

    protected getIdFromJsonOrganization(jsonOrganization: any): string {
        const name = this.getNameFromJsonOrganization(jsonOrganization);
        const id = name && name.length > 100 ? crypto.createHash('sha256').update(name, 'utf8').digest('hex') : name;
        return id
    }

    protected getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.json.fileIdentifier[0].CharacterString[0]._;
    }

    protected getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return this.getIdFromJsonDataset(jsonDataset) + '-' + this.getJsonDistributionsArray(jsonDataset).indexOf(jsonDistribution);
    }

    protected getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonpath.value(jsonOrganization, '$.organisationName[0].CharacterString[0]._');
    }

    protected getNameFromJsonDataset(jsonDataset: any): string {
        const dataIdentification = jsonpath.query(jsonDataset.json, '$.identificationInfo[*].MD_DataIdentification[*].dataIdentification[*]');
        const serviceIdentification = jsonpath.query(jsonDataset.json, '$.identificationInfo[*].SV_ServiceIdentification[*].serviceIdentification[*]');
        const identification = dataIdentification || serviceIdentification || {};
        const title = jsonpath.value(identification, '$.citation[*].CI_Citation[*].title[*].CharacterString[*]._') || this.getIdFromJsonDataset(jsonDataset);
        return title;
    }

    protected getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        const name = jsonpath.value(jsonDistribution, '$.name[*].CharacterString[*]._');
        const description = jsonpath.value(jsonDistribution, '$.description[*].CharacterString[*]._');
        return name || description || this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
    }
}

export interface CswConnectorOptions extends JsonConnectorOptions {
    source: Csw;
}
