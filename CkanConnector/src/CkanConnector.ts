import { AspectDefinition, AspectDefinitionsApi, Record } from './generated/registry/api';
import { Observable, IPromise } from 'rx';
import Ckan, { CkanDataset } from './Ckan';
import Registry from './Registry';

export interface AspectBuilder {
    aspectDefinition: AspectDefinition,
    template: string
}

export interface CkanConnectorOptions {
    ckan: Ckan,
    registry: Registry,
    aspectBuilders?: AspectBuilder[],
    ignoreHarvestSources?: string[]
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

    run(): IPromise<any> {
        return this.createAspectDefinitions().then(() => this.createRecords());
    }

    private createAspectDefinitions() {
        return this.registry.putAspectDefinitions(this.aspectBuilders.map(builder => builder.aspectDefinition));
    }

    private createRecords() {
        const datasets = this.ckan.packageSearch(this.ignoreHarvestSources);
        const records = datasets.map(dataset => this.datasetToRecord(dataset));
        return this.registry.putRecords(records);
    }

    private datasetToRecord(dataset: CkanDataset): Record {
        return {
            id: dataset.id,
            name: dataset.title || dataset.name,
            aspects: {}
        };
    }
}