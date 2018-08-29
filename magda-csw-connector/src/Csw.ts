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
        const responsibleParties = jsonpath
            .nodes(dataset.json, "$..CI_ResponsibleParty[*]")
            .map(node => {
                return {
                    ...node,
                    role: jsonpath.value(
                        node.value,
                        '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'
                    ),
                    orgName: jsonpath.value(
                        node.value,
                        "$..organisationName[*].CharacterString[0]._"
                    )
                };
            });

        /**
         * Filter ResponsibleParty by roles is not a good idea as there are too many possible roles.
         * Besides, the urls to list of role types returns 404
         * Different type of people may ends up being the contact point of this dataset (publisher).
         * So they could be on:
         * - contact path
         * - pointOfContact path
         * - identificationInfo path (list of entities that are related to this data) with role `pointOfContact`
         *
         * The last scenario indicates the dataset doesn't have proper `publisher` info.
         * All `pointOfContact` in this section are likely to be authors or any party related to the data.
         * But they may not be the actual publisher.
         *
         * We should only use information from this section if we don't have a better choice.
         */
        let datasetOrgs = responsibleParties.filter(node => {
            return (
                node.path.findIndex(
                    pathItem =>
                        String(pathItem)
                            .toLowerCase()
                            .indexOf("pointofcontact") != -1
                ) != -1 ||
                String(
                    jsonpath.value(
                        node.value,
                        '$.role[*].CI_RoleCode[*]["$"].codeListValue.value'
                    )
                ).toLowerCase() === "pointofcontact"
            );
        });

        if (!datasetOrgs || datasetOrgs.length === 0) {
            if (!responsibleParties || responsibleParties.length === 0) {
                return Promise.resolve(undefined);
            } else {
                /**
                 * it's possible to reach here
                 * i.e. the dataset has no any point of contact info
                 * No need to look at further
                 * Just pick the first one
                 */
                return Promise.resolve(responsibleParties[0]["value"]);
            }
        }

        let orgData = datasetOrgs[0]["value"];

        if (datasetOrgs.length == 1) {
            return Promise.resolve(orgData);
        }

        /**
         * More than one pointOfContact found
         * Try to avoid identificationInfo section as it contains mixture of all relevent parties
         */
        const altOrgs = datasetOrgs.filter(node => {
            return (
                node.path.findIndex(
                    pathItem =>
                        String(pathItem)
                            .toLowerCase()
                            .indexOf("identificationinfo") != -1
                ) == -1
            );
        });

        if (altOrgs.length != 0) {
            orgData = altOrgs[0]["value"];
        } else {
            /**
             * This means there ISN'T a proper pointOfContact section.
             * This probably should be considered as a mistake
             * and only very small amount of data like this can be found during my tests.
             * We should now try pick one fron a list relevant entities.
             */
            const byRole = groupBy(datasetOrgs, node => node.role);
            if (byRole["pointOfContact"]) {
                const firstPointOfContactNode: any = byRole.pointOfContact[0];
                orgData = firstPointOfContactNode.value;
            } else {
                /**
                 * Some dataset was set a non `pointOfContact` role
                 * But it's on `pointOfContact` path
                 */
                const pocNodes = datasetOrgs.filter(node => {
                    return (
                        node.path.findIndex(
                            pathItem =>
                                String(pathItem)
                                    .toLowerCase()
                                    .indexOf("pointofcontact") != -1
                        ) != -1
                    );
                });
                if (pocNodes.length) {
                    orgData = pocNodes[0]["value"];
                }
            }
            /**
             * Otherwise, don't touch orgData --- use the first one from the initial shorter list would be the best
             * Main contributor usually will be listed as the first.
             * We can be more accurate if we drill down into all possible roles.
             * But it probably won't be necessary as dataset reaches here should be lower than 1%~2% based on my tests.
             */
        }

        return Promise.resolve(orgData);
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
                    try {
                        const data = this.xmlParser.parseFromString(body);
                        if (
                            data.documentElement.getElementsByTagNameNS(
                                "*",
                                "SearchResults"
                            ).length < 1
                        )
                            throw new Error(
                                "Invalid Server Response or Empty result returned!"
                            );
                        console.log("Received@" + startIndex);
                        resolve(data);
                    } catch (e) {
                        reject(e);
                    }
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
