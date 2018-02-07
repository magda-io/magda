import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
import * as URI from "urijs";
import * as request from "request";
import AsyncPage from "@magda/typescript-common/dist/AsyncPage";
import CswUrlBuilder from "./CswUrlBuilder";
import retry from "@magda/typescript-common/dist/retry";
import formatServiceError from "@magda/typescript-common/dist/formatServiceError";
import * as xmldom from "xmldom";
import * as xml2js from "xml2js";
import * as jsonpath from "jsonpath";
import { groupBy } from "lodash";

export default class Csw implements ConnectorSource {
    public readonly baseUrl: uri.URI;
    public readonly id: string;
    public readonly name: string;
    public readonly pageSize: number;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly urlBuilder: CswUrlBuilder;

    private readonly xmlParser = new xmldom.DOMParser();
    private readonly xmlSerializer = new xmldom.XMLSerializer();

    constructor(options: CswOptions) {
        this.baseUrl = new URI(options.baseUrl);
        this.id = options.id;
        this.name = options.name;
        this.pageSize = options.pageSize || 10;
        this.maxRetries = options.maxRetries || 10;
        this.secondsBetweenRetries = options.secondsBetweenRetries || 10;
        this.urlBuilder = new CswUrlBuilder({
            id: options.id,
            name: options.name,
            baseUrl: options.baseUrl
        });
    }

    public getRecords(options?: {
        constraint?: string;
        start?: number;
        maxResults?: number;
    }): AsyncPage<Document> {
        options = options || {};

        const url = new URI(this.urlBuilder.getRecordsUrl(options.constraint));

        const startStart = options.start || 0;
        let startIndex = startStart;

        return AsyncPage.create<any>(previous => {
            if (previous) {
                const searchResults = previous.documentElement.getElementsByTagNameNS(
                    "*",
                    "SearchResults"
                )[0];
                const numberOfRecordsMatched = parseInt(
                    searchResults.attributes.getNamedItem(
                        "numberOfRecordsMatched"
                    ).value,
                    10
                );
                const nextRecord = parseInt(
                    searchResults.attributes.getNamedItem("nextRecord").value,
                    10
                );

                const nextStartIndex = nextRecord - 1;

                const remaining = options.maxResults
                    ? options.maxResults - (nextStartIndex - startStart)
                    : undefined;

                if (
                    nextRecord === 0 ||
                    nextRecord >= numberOfRecordsMatched ||
                    nextStartIndex === startIndex ||
                    remaining <= 0
                ) {
                    return undefined;
                }

                startIndex = nextStartIndex;

                return this.requestRecordsPage(url, startIndex, remaining);
            } else {
                return this.requestRecordsPage(
                    url,
                    startIndex,
                    options.maxResults
                );
            }
        });
    }

    public getJsonDatasets(
        constraint?: string,
        maxResults?: number
    ): AsyncPage<any[]> {
        const recordPages = this.getRecords({
            constraint: constraint,
            maxResults: maxResults
        });
        return recordPages.map(pageXml => {
            const searchResults = pageXml.documentElement.getElementsByTagNameNS(
                "*",
                "SearchResults"
            )[0];
            const records = searchResults.getElementsByTagNameNS(
                "*",
                "MD_Metadata"
            );

            const result = [];

            for (let i = 0; i < records.length; ++i) {
                const recordXml = records.item(i);
                result.push(this.xmlRecordToJsonRecord(recordXml));
            }

            return result;
        });
    }

    public getJsonDataset(id: string): Promise<any> {
        const url = this.urlBuilder.getRecordByIdUrl(id);

        const xmlPromise = new Promise<any>((resolve, reject) => {
            request(url.toString(), {}, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(this.xmlParser.parseFromString(body));
            });
        });

        return xmlPromise.then(xml => {
            const recordXml = xml.documentElement.getElementsByTagNameNS(
                "*",
                "MD_Metadata"
            )[0];
            return this.xmlRecordToJsonRecord(recordXml);
        });
    }

    public searchDatasetsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        const constraint = `
            <ogc:Filter xmlns:ogc="http://www.opengis.net/ogc" xmlns:dc="http://purl.org/dc/elements/1.1/">
                <ogc:PropertyIsLike escapeChar="\\" singleChar="?" wildCard="*">
                    <ogc:PropertyName>Title</ogc:PropertyName>
                        <ogc:Literal>*${title
                            .replace(/\\/g, "\\\\")
                            .replace(/\*/g, "\\*")
                            .replace(/\?/g, "\\?")}*</ogc:Literal>
                </ogc:PropertyIsLike>
            </ogc:Filter>`.replace(/\s\s+/g, " ");
        return this.getJsonDatasets(constraint, 10);
    }

    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(
            this.getJsonDistributionsArray(dataset)
        );
    }

    public readonly hasFirstClassOrganizations = false;

    public getJsonFirstClassOrganizations(): AsyncPage<object[]> {
        return undefined;
    }

    public getJsonFirstClassOrganization(id: string): Promise<object> {
        return undefined;
    }

    public searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        return undefined;
    }

    public getJsonDatasetPublisherId(dataset: any): string {
        return undefined;
    }

    public getJsonDatasetPublisher(dataset: any): Promise<any> {
        // Find all parties that are publishers, owners, or custodians.
        const responsibleParties = jsonpath.query(
            dataset.json,
            "$..CI_ResponsibleParty[*]"
        );
        const byRole = groupBy(responsibleParties, party =>
            jsonpath.value(
                party,
                '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'
            )
        );
        const datasetOrgs =
            byRole.publisher || byRole.owner || byRole.custodian;
        if (!datasetOrgs || datasetOrgs.length === 0) {
            return undefined;
        }

        return Promise.resolve(datasetOrgs[0]);
    }

    private getJsonDistributionsArray(dataset: any): any[] {
        return jsonpath.query(
            dataset.json,
            "$.distributionInfo[*].MD_Distribution[*].transferOptions[*].MD_DigitalTransferOptions[*].onLine[*].CI_OnlineResource[*]"
        );
    }

    private xmlRecordToJsonRecord(recordXml: Element) {
        const xml2jsany: any = xml2js; // needed because the current TypeScript declarations don't know about xml2js.processors.
        const parser = new xml2js.Parser({
            xmlns: true,
            tagNameProcessors: [xml2jsany.processors.stripPrefix],
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

        return {
            json: json,
            //            xml: recordXml,
            xmlString: xmlString
        };
    }

    private requestRecordsPage(
        url: uri.URI,
        startIndex: number,
        maxResults: number
    ): Promise<any> {
        const pageSize =
            maxResults && maxResults < this.pageSize
                ? maxResults
                : this.pageSize;

        const pageUrl = url.clone();
        pageUrl.addSearch("startPosition", startIndex + 1);
        pageUrl.addSearch("maxRecords", pageSize);

        const operation = () =>
            new Promise<any>((resolve, reject) => {
                console.log("Requesting " + pageUrl.toString());
                request(pageUrl.toString(), {}, (error, response, body) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    console.log("Received@" + startIndex);
                    resolve(this.xmlParser.parseFromString(body));
                });
            });

        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to GET ${pageUrl.toString()}.`,
                        e,
                        retriesLeft
                    )
                )
        );
    }
}

export interface CswOptions {
    baseUrl: string;
    id: string;
    name: string;
    pageSize?: number;
    maxRetries?: number;
    secondsBetweenRetries?: number;
}
