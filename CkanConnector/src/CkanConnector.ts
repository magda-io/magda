import { AspectDefinition, AspectDefinitionsApi, Record } from './generated/registry/api';
import { Observable } from 'rx';
import Ckan, { CkanDataset } from './Ckan';
import Registry from './Registry';
import createServiceError from './createServiceError';

export interface AspectBuilder {
    aspectDefinition: AspectDefinition,
    builderFunctionString: string
}

export interface CkanConnectorOptions {
    ckan: Ckan,
    registry: Registry,
    aspectBuilders?: AspectBuilder[],
    ignoreHarvestSources?: string[]
}

interface CompiledAspect {
    id: string,
    builderFunction: Function
}

interface Aspects {
    [propName: string]: any;
}

export class CkanConnectionResult {
    public datasetsConnected: number = 0;
    public errors: Error[] = [];
}

export default class CkanConnector {
    private ckan: Ckan;
    private registry: Registry;
    private ignoreHarvestSources: string[];

    public aspectBuilders: AspectBuilder[]

    constructor({
        ckan,
        registry,
        aspectBuilders = [],
        ignoreHarvestSources = []
    }: CkanConnectorOptions) {
        this.ckan = ckan;
        this.registry = registry;
        this.aspectBuilders = aspectBuilders.slice();
        this.ignoreHarvestSources = ignoreHarvestSources.slice();
    }

    run(): Promise<CkanConnectionResult> {
        const templates = this.aspectBuilders.map(builder => ({
            id: builder.aspectDefinition.id,
            builderFunction: new Function('dataset', 'source', builder.builderFunctionString)
        }));

        return this.createAspectDefinitions().reduce((connectionResult, value) => {
            if (value instanceof Error) {
                connectionResult.errors.push(value);
            }
            return connectionResult;
        }, new CkanConnectionResult()).flatMap(connectionResult => {
            // If there were errors creating the aspect definitions, don't try to create records.
            if (connectionResult.errors.length > 0) {
                return Observable.just(connectionResult);
            }

            return this.createRecords(templates).reduce((connectionResult, value) => {
                if (value instanceof Error) {
                    connectionResult.errors.push(value);
                } else {
                    ++connectionResult.datasetsConnected;
                }
                return connectionResult;
            }, connectionResult);
        }).toPromise<Promise<CkanConnectionResult>>(Promise);
    }

    private createAspectDefinitions() {
        return this.registry.putAspectDefinitions(this.aspectBuilders.map(builder => builder.aspectDefinition));
    }

    private createRecords(templates: CompiledAspect[]) {
        const datasets = this.ckan.packageSearch(this.ignoreHarvestSources).take(10);
        const records = datasets.map(dataset => this.datasetToRecord(templates, dataset));
        return this.registry.putRecords(records);
    }

    private datasetToRecord(templates: CompiledAspect[], dataset: CkanDataset): Record {
        const aspects: Aspects = {};
        templates.forEach(aspect => {
            aspects[aspect.id] = aspect.builderFunction(dataset, this.ckan);
        });

        return {
            id: dataset.id,
            name: dataset.title || dataset.name,
            aspects: aspects
        };
    }
}