import { AspectDefinition, AspectDefinitionsApi, Record, RecordsApi } from './generated/registry/api';
import * as URI from 'urijs';
import retry from './retry';
import formatServiceError from './formatServiceError';
import * as http from 'http';
import createServiceError from './createServiceError';

export interface RegistryOptions {
    baseUrl: string,
    maxRetries?: number,
    secondsBetweenRetries?: number
}

export interface PutResult {
    successfulPuts: number,
    errors: Error[]
}

export default class Registry {
    private baseUrl: uri.URI;
    private aspectDefinitionsApi: AspectDefinitionsApi;
    private recordsApi: RecordsApi;
    private maxRetries: number;
    private secondsBetweenRetries: number;

    constructor({
        baseUrl,
        maxRetries = 10,
        secondsBetweenRetries = 10
    }: RegistryOptions) {
        this.baseUrl = new URI(baseUrl);
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;

        const registryApiUrl = this.baseUrl.toString();
        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
    }

    getRecordUrl(id: string): string {
        return this.baseUrl.clone().segment('records').segment(id).toString();
    }

    putAspectDefinition(aspectDefinition: AspectDefinition): Promise<AspectDefinition | Error> {
        const operation = () => this.aspectDefinitionsApi.putById(encodeURIComponent(aspectDefinition.id), aspectDefinition);
        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to create aspect definition "${aspectDefinition.id}".`, e, retriesLeft)))
            .then(result => result.body)
            .catch(createServiceError);
    }

    putRecord(record: Record): Promise<Record | Error> {
        const operation = () => this.recordsApi.putById(encodeURIComponent(record.id), record);
        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to PUT data registry record with ID "${record.id}".`, e, retriesLeft)))
            .then(result => result.body)
            .catch(createServiceError);
    }
}
