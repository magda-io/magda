import { AspectDefinition, AspectDefinitionsApi, Record, RecordsApi } from './generated/registry/api';
import * as URI from 'urijs';
import { Observable } from 'rx';
import retry from './retry';
import formatServiceError from './formatServiceError';

export interface RegistryOptions {
    baseUrl: string
}

export default class Registry {
    private baseUrl: uri.URI;
    private aspectDefinitionsApi: AspectDefinitionsApi;
    private recordsApi: RecordsApi;

    constructor({
        baseUrl
    }: RegistryOptions) {
        this.baseUrl = new URI(baseUrl);

        const registryApiUrl = this.baseUrl.clone().segment('api/0.1').toString();
        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
    }

    putAspectDefinitions(aspectDefinitions: AspectDefinition[]): Promise<any> {
        const aspectDefinitionSource = Observable.fromArray(aspectDefinitions).controlled();

        const promise = aspectDefinitionSource.flatMap(aspectDefinition => {
            const operation = () => this.aspectDefinitionsApi.putById(aspectDefinition.id, aspectDefinition).then(result => {
                aspectDefinitionSource.request(1);
                return result;
            }).catch(e => {
                aspectDefinitionSource.request(1);
                throw e;
            });
            return retry(operation, 10, 10, (e, retriesLeft) => console.log(formatServiceError(`Failed to create aspect definition "${aspectDefinition.id}".`, e, retriesLeft)));
        }).toArray().toPromise(Promise);

        // Create up to 6 aspect definitions at a time.
        aspectDefinitionSource.request(6);

        return Promise.resolve(promise);
    }

    putRecords(records: Observable<Record>): Promise<any> {
        const recordsSource = records.controlled();

        const promise = recordsSource.flatMap(record => {
            const operation = () => this.recordsApi.putById(record.id, record).then(result => {
                recordsSource.request(1);
                return result;
            }).catch(e => {
                recordsSource.request(1);
                throw e;
            });
            return retry(operation, 10, 10, (e, retriesLeft) => console.log(formatServiceError(`Failed to PUT data registry record with ID "${record.id}".`, e, retriesLeft)));
        }).toPromise();

        recordsSource.request(6);

        return Promise.resolve(promise);
    }
}