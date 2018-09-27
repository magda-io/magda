import { ConnectorSource } from "@magda/typescript-common/dist/JsonConnector";
import * as request from "request";
import AsyncPage, {
    forEachAsync
} from "@magda/typescript-common/dist/AsyncPage";
import CsvTransformer from "./CsvTransformer";
import { similarity, findClosestFieldThreshold } from "./fuzzyMatch";

import parseSpreadsheet from "./parseSpreadsheet";

export default class Csv implements ConnectorSource {
    public readonly sheetUrl: string;
    public readonly id: string;
    public readonly name: string;
    public readonly maxRetries: number;
    public readonly secondsBetweenRetries: number;
    public readonly transformer: CsvTransformer;

    constructor(options: CsvOptions) {
        this.sheetUrl = options.sheetUrl;
        this.id = options.id;
        this.name = options.name;
        this.maxRetries = options.maxRetries || 10;
        this.secondsBetweenRetries = options.secondsBetweenRetries || 10;
        this.transformer = options.transformer;
    }

    async getData() {
        const data = parseSpreadsheet(await downloadBuffer(this.sheetUrl));

        data.forEach((row, index) => {
            if (findClosestFieldThreshold(row, 0.95, "id") === undefined) {
                row.id = `row-${index + 1}`;
            }
        });

        return data;
    }

    public getJsonDatasets(
        constraint?: string,
        maxResults?: number
    ): AsyncPage<any[]> {
        // // All data at one go
        // return AsyncPage.create<any>((previous: any) => {
        //     return previous ? undefined : this.getData();
        // });

        // With incremental logging
        let data: any[] = undefined;
        function next() {
            const slice = data.splice(0, 100);
            console.log(
                `Returning a slice of ${slice.length} rows of data from ${
                    data.length
                } more rows!`
            );
            return slice.length
                ? new Promise(resolve => resolve(slice))
                : undefined;
        }
        return AsyncPage.create<any>((previous: any) => {
            if (!previous) {
                return new Promise(async resolve => {
                    console.log("Fetching data!");
                    data = await this.getData();
                    resolve(next());
                });
            } else {
                return next();
            }
        });
    }

    public getJsonDistributions(dataset: any): AsyncPage<object[]> {
        // our row is our distribution
        // we are trying to make a different distribution for each format
        let formatsList: string[] = [];
        const formats = findClosestFieldThreshold(dataset, 0.5, "format");
        if (formats) {
            formatsList = formats
                .replace(/\s+/g, " ")
                .split(/\s*[;,#]+\s*/g)
                .filter(i => i);
        }
        if (formatsList.length > 0) {
            return AsyncPage.single<object[]>(
                formatsList.map((format, index) => {
                    const distribution = Object.assign({}, dataset);
                    distribution.format = format;
                    distribution.id = `${
                        dataset.id
                    }-${index}-${format
                        .toLowerCase()
                        .replace(/[^a-z0-9]/gi, "")}`;
                    return distribution;
                })
            );
        } else {
            return AsyncPage.single<object[]>([dataset]);
        }
    }

    public async getJsonDatasetPublisher(dataset: any): Promise<any> {
        return dataset;
    }

    public async getJsonDataset(id: string): Promise<any> {
        let found: any;
        await forEachAsync(this.getJsonDatasets(), 1, async dataset => {
            const datasetId = this.transformer.getIdFromJsonDataset(dataset, "")
                .id;
            if (datasetId === id) {
                found = dataset;
            }
        });
        return found;
    }

    public searchDatasetsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]> {
        const search = async () => {
            return (await this.getData())
                .map(dataset => {
                    const score = similarity(
                        this.transformer.getNameFromJsonDataset(dataset),
                        title
                    );
                    return { dataset, score };
                })
                .sort((a, b) => b.score - a.score)
                .slice(0, maxResults);
        };
        return AsyncPage.create<any>((previous: any) => {
            return previous ? undefined : search();
        });
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
}

function downloadBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        request(
            url,
            {
                encoding: null // https://stackoverflow.com/questions/14855015/getting-binary-content-in-node-js-using-request
            },
            (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(body);
                }
            }
        );
    });
}

export interface CsvOptions {
    sheetUrl: string;
    id: string;
    name: string;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    transformer: CsvTransformer;
}
