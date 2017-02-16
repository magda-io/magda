import { AspectDefinition, AspectDefinitionsApi, Record } from './generated/registry/api';
import { Observable, IPromise } from 'rx';
import Ckan, { CkanDataset } from './Ckan';
import Registry from './Registry';
import * as Handlebars from 'handlebars';

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

interface CompiledAspect {
    id: string,
    template: Function
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
        const templates = this.aspectBuilders.map(builder => ({
            id: builder.aspectDefinition.id,
            template: new Function('dataset', builder.template)
        }));

        return this.createAspectDefinitions().then(() => this.createRecords(templates));
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
        const aspects = {};
        templates.forEach(aspect => {
            aspects[aspect.id] = aspect.template(dataset);
        });

        return {
            id: dataset.id,
            name: dataset.title || dataset.name,
            aspects: aspects
        };
    }
}