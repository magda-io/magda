import { AspectDefinition, AspectDefinitionsApi, Record, RecordsApi } from './generated/registry/api';
import * as URI from 'urijs';
import { Observable } from 'rx';
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

        const registryApiUrl = this.baseUrl.clone().segment('api/0.1').toString();
        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
    }

    putAspectDefinitions(aspectDefinitions: AspectDefinition[]): Observable<AspectDefinition | Error> {
        const aspectDefinitionSource = Observable.fromArray(aspectDefinitions).controlled();

        const observable = aspectDefinitionSource.flatMap(aspectDefinition => {
            const operation = () => this.aspectDefinitionsApi.putById(aspectDefinition.id, aspectDefinition).then(result => {
                aspectDefinitionSource.request(1);
                return result;
            }).catch(e => {
                aspectDefinitionSource.request(1);
                throw e;
            });

            return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to create aspect definition "${aspectDefinition.id}".`, e, retriesLeft)))
                .then(result => result.body)
                .catch(createServiceError);
        });

        // Create up to 6 aspect definitions at a time.
        aspectDefinitionSource.request(6);

        return observable;
    }

    putRecords(records: Observable<Record>): Observable<Record | Error> {
        const recordsSource = records.controlled();

        const observable = recordsSource.flatMap(record => {
            const operation = () => this.recordsApi.putById(record.id, record).then(result => {
                recordsSource.request(1);
                return result;
            }).catch(e => {
                recordsSource.request(1);
                throw e;
            });
            return retry(operation, this.secondsBetweenRetries, this.maxRetries, (e, retriesLeft) => console.log(formatServiceError(`Failed to PUT data registry record with ID "${record.id}".`, e, retriesLeft)))
                .then(result => result.body)
                .catch(createServiceError);
        });

        recordsSource.request(6);

        return observable;
    }
}