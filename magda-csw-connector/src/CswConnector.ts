import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import JsonConnector, { JsonConnectorOptions } from '@magda/typescript-common/lib/JsonConnector';
import Csw from './Csw';
import { flatMap } from 'lodash';
import * as xmldom from 'xmldom';
import * as xml2js from 'xml2js';
import * as jsonpath from 'jsonpath';
import { groupBy } from 'lodash';

export default class CswConnector extends JsonConnector {
    private readonly csw: Csw;
    private readonly xmlSerializer = new xmldom.XMLSerializer();

    constructor(options: CswConnectorOptions) {
        super(options);
        this.csw = options.source;
    }

    protected getJsonOrganizations(): AsyncPage<any[]> {
        const allOrgs = new Set<string>();
        //this.getJsonDatasets();
        //return AsyncPage.none<any[]>();
        return this.getJsonDatasets().map(datasets => {
            // return [];
            const thisPageOrgs: any[] = [];
            datasets.forEach(dataset => {
                // Find all parties that are publishers, owners, or custodians.
                const responsibleParties = jsonpath.query(dataset, '$..CI_ResponsibleParty[*]');
                const byRole = groupBy(responsibleParties, party => jsonpath.value(party, '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'));
                const datasetOrgs = byRole.publisher || byRole.owner || byRole.custodian;
                if (!datasetOrgs || datasetOrgs.length === 0) {
                    return;
                }

                const datasetOrg = datasetOrgs[0];
                const orgName = jsonpath.value(datasetOrg, '$.organisationName[0].CharacterString[0]._');

                if (orgName && !allOrgs.has(orgName)) {
                    allOrgs.add(orgName);
                    thisPageOrgs.push(datasetOrg);
                }
            });

            return thisPageOrgs;
        });
    }

    protected getJsonDatasets(): AsyncPage<any[]> {
        const recordPages = this.csw.getRecords();
        return recordPages.map(pageXml => {
            const searchResults = pageXml.documentElement.getElementsByTagNameNS('http://www.opengis.net/cat/csw/2.0.2', 'SearchResults')[0];
            const records = searchResults.getElementsByTagNameNS('http://www.isotc211.org/2005/gmd', 'MD_Metadata');

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

                json.xmlString = xmlString;

                result.push(json);
            }

            return result;
        });
    }

    protected getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(this.getJsonDistributionsArray(dataset));
    }

    private getJsonDistributionsArray(dataset: any): any[] {
        return flatMap(dataset.distributionInfo || [], di =>
            flatMap(di.MD_Distribution || [], mdd =>
                flatMap(mdd.transferOptions || [], to =>
                    flatMap(to.MD_DigitalTransferOptions || [], mddto =>
                        flatMap(mddto.onLine || [], ol => ol.CI_OnlineResource || [])))));
    }

    protected getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonpath.value(jsonOrganization, '$.organisationName[0].CharacterString[0]._');
    }

    protected getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.fileIdentifier[0].CharacterString[0]._;
    }

    protected getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return this.getIdFromJsonDataset(jsonDataset) + '-' + this.getJsonDistributionsArray(jsonDataset).indexOf(jsonDistribution);
    }

    protected getNameFromJsonOrganization(jsonOrganization: any): string {
        return this.getIdFromJsonOrganization(jsonOrganization);
    }

    protected getNameFromJsonDataset(jsonDataset: any): string {
        const {
            identificationInfo: [
                {
                    MD_DataIdentification: [
                        dataIdentification = <any>undefined
                    ] = [],
                    SV_ServiceIdentification: [
                        serviceIdentification = <any>undefined
                    ] = []
                } = {}
            ] = []
        } = jsonDataset;

        const identification = dataIdentification || serviceIdentification || {};

        const {
            citation: [
                {
                    CI_Citation: [
                        {
                            title: [
                                {
                                    CharacterString: [
                                        {
                                            _: title = this.getIdFromJsonDataset(jsonDataset)
                                        } = {}
                                    ] = []
                                } = {}
                            ] = []
                        } = {}
                    ] = []
                } = {}
            ] = []
        } = identification;

        return title;
    }

    protected getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        const {
            name: [
                {
                    CharacterString: [
                        {
                            _: name = <string>undefined
                        } = {}
                    ] = []
                } = {}
            ] = [],
            description: [
                {
                    CharacterString: [
                        {
                            _: description = <string>undefined
                        } = {}
                    ] = []
                } = {}
            ] = []
        } = jsonDistribution;

        return name || description || this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
    }
}

export interface CswConnectorOptions extends JsonConnectorOptions {
    source: Csw;
}
