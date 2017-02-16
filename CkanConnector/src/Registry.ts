import { AspectDefinition, AspectDefinitionsApi, Record, RecordsApi } from './generated/registry/api';
import * as URI from 'urijs'
import { Observable, IPromise } from 'rx';

export default class Registry {
    private baseUrl: uri.URI;
    private aspectDefinitionsApi: AspectDefinitionsApi;
    private recordsApi: RecordsApi;

    constructor({
        baseUrl
    }) {
        this.baseUrl = new URI(baseUrl);

        const registryApiUrl = this.baseUrl.clone().segment('api/0.1').toString();
        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
    }

    putAspectDefinitions(aspectDefinitions: AspectDefinition[]): IPromise<any> {
        const aspectDefinitionSource = Observable.fromArray(aspectDefinitions).controlled();

        const promise = aspectDefinitionSource.flatMap(aspectDefinition => {
            return this.aspectDefinitionsApi.putById(aspectDefinition.id, aspectDefinition).then(result => {
                aspectDefinitionSource.request(1);
                return result;
            }).catch(e => {
                aspectDefinitionSource.request(1);
                throw e;
            });
        }).toArray().toPromise();

        // Create up to 6 aspect definitions at a time.
        aspectDefinitionSource.request(6);

        return Promise.resolve(promise);
    }

    putRecords(records: Observable<Record>): IPromise<any> {
        const recordsSource = records.controlled();

        const promise = recordsSource.flatMap(record => {
            return this.recordsApi.putById(record.id, record).then(result => {
                recordsSource.request(1);
                return result;
            }).catch(e => {
                recordsSource.request(1);
                throw e;
            })
        }).toPromise();

        recordsSource.request(6);

        return Promise.resolve(promise);
    }
}