import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import formatServiceError from '@magda/typescript-common/lib/formatServiceError';
import JsonConnector from '@magda/typescript-common/lib/JsonConnector';
import { JsonConnectorOptions } from '@magda/typescript-common/lib/JsonConnector';
import retry from '@magda/typescript-common/lib/retry';
import * as request from 'request';

export default class ProjectOpenDataConnector extends JsonConnector {
    private url: string;
    private secondsBetweenRetries: number;
    private maxRetries: number;
    private dataPromise: Promise<object>;

    constructor(options: ProjectOpenDataConnectorOptions) {
        const source = {
            name: options.name,
            url: options.url
        };

        super(Object.assign({}, options, { source }));

        this.url = options.url;
        this.secondsBetweenRetries = options.secondsBetweenRetries || 10;
        this.maxRetries = options.maxRetries || 10;

        const operation = () => new Promise<object>((resolve, reject) => {
            request(this.url, { json: true }, (error, response, body) => {
                if (error) {
                    reject(error);
                    return;
                }
                resolve(body);
            });
        });

        this.dataPromise = retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) => console.log(formatServiceError(`Failed to GET ${this.url}.`, e, retriesLeft)));
    }

    protected getJsonOrganizations(): AsyncPage<object[]> {
        return AsyncPage.singlePromise<object[]>(this.dataPromise.then((response: any) => {
            const orgs = new Set<string>();
            const datasets: any = response.dataset;
            datasets.forEach((dataset: any) => {
                if (dataset.publisher && dataset.publisher.name) {
                    orgs.add(dataset.publisher.name);
                }
            });
            return [...orgs].map(name => ({name: name}));
        }));
    }

    protected getJsonDatasets(): AsyncPage<object[]> {
        return AsyncPage.singlePromise<object[]>(this.dataPromise.then((response: any) => response.dataset));
    }

    protected getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(dataset.distribution || []);
    }

    protected getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name;
    }

    protected getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.identifier;
    }

    protected getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDataset.identifier + '-' + jsonDataset.distribution.indexOf(jsonDistribution);
    }

    protected getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.name;
    }

    protected getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title;
    }

    protected getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.title || this.getIdFromJsonDistribution(jsonDistribution, jsonDataset);
    }
}

export interface ProjectOpenDataConnectorOptions extends JsonConnectorOptions {
    name: string,
    url: string,
    secondsBetweenRetries?: number;
    maxRetries?: number;
}
