import { AspectDefinition, AspectDefinitionsApi, Record, RecordsApi, RecordAspectsApi } from './generated/registry/api';
import * as URI from 'urijs';
import retry from './retry';
import formatServiceError from './formatServiceError';
import createServiceError from './createServiceError';
import * as jwt from 'jsonwebtoken';

export interface RegistryOptions {
    baseUrl: string,
    maxRetries?: number,
    secondsBetweenRetries?: number,
    jwtSecret?: string
}

export interface PutResult {
    successfulPuts: number,
    errors: Error[]
}

export default class Registry {
    private baseUrl: uri.URI;
    private aspectDefinitionsApi: AspectDefinitionsApi;
    private recordsApi: RecordsApi;
    private recordAspectsApi: RecordAspectsApi;
    private maxRetries: number;
    private secondsBetweenRetries: number;
    private sessionHeaderValue: string;

    constructor({
        baseUrl,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        jwtSecret = process.env.JWT_SECRET || process.env.npm_package_config_JWT_SECRET
    }: RegistryOptions) {
        this.baseUrl = new URI(baseUrl);
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;

        const registryApiUrl = this.baseUrl.toString();
        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
        this.recordsApi.useQuerystring = true; // Use querystring instead of qs to construct URL
        this.recordAspectsApi = new RecordAspectsApi(registryApiUrl);
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

    getRecords(aspect?: Array<string>, optionalAspect?: Array<string>, pageToken?: string, dereference?: boolean) {
        const operation = (pageToken: string) => () => this.recordsApi.getAll(aspect, optionalAspect, pageToken, undefined, undefined, dereference);
        return <any>(retry(operation(pageToken), this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError('Failed to GET records.', e, retriesLeft)))
            .then(result => result.body)
            .catch(createServiceError));
    }

    putRecord(record: Record): Promise<Record | Error> {
        const operation = () => this.recordsApi.putById(encodeURIComponent(record.id), record);
        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to PUT data registry record with ID "${record.id}".`, e, retriesLeft)))
            .then(result => result.body)
            .catch(createServiceError);
    }

    putRecordAspect(recordId: string, aspectId: string, aspect: any): Promise<Record | Error> {
        const operation = () => this.recordAspectsApi.putById(encodeURIComponent(recordId), aspectId, aspect);
        return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to PUT data registry aspect ${aspectId} for record with ID "${recordId}".`, e, retriesLeft)))
            .then(result => result.body)
            .catch(createServiceError);
    }
}
