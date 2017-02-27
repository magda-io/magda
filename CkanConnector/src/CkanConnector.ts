import { AspectDefinition, AspectDefinitionsApi, Record } from './generated/registry/api';
import Ckan, { CkanDataset } from './Ckan';
import Registry from './Registry';
import AsyncPage, { forEachAsync } from './AsyncPage';
import * as moment from 'moment';

export interface AspectBuilder {
    aspectDefinition: AspectDefinition,
    builderFunctionString: string,
    setupFunctionString?: string
}

export interface CkanConnectorOptions {
    ckan: Ckan,
    registry: Registry,
    aspectBuilders?: AspectBuilder[],
    ignoreHarvestSources?: string[],
    maxConcurrency?: number
}

interface CompiledAspect {
    id: string,
    builderFunction: Function,
    setupResult: any
}

interface Aspects {
    [propName: string]: any;
}

export class CkanConnectionResult {
    public aspectDefinitionsConnected: number = 0;
    public datasetsConnected: number = 0;
    public errors: Error[] = [];
}

export default class CkanConnector {
    private ckan: Ckan;
    private registry: Registry;
    private ignoreHarvestSources: string[];
    private maxConcurrency: number;

    public aspectBuilders: AspectBuilder[]

    constructor({
        ckan,
        registry,
        aspectBuilders = [],
        ignoreHarvestSources = [],
        maxConcurrency = 6
    }: CkanConnectorOptions) {
        this.ckan = ckan;
        this.registry = registry;
        this.aspectBuilders = aspectBuilders.slice();
        this.ignoreHarvestSources = ignoreHarvestSources.slice();
        this.maxConcurrency = maxConcurrency;
    }

    /**
     * Queries CKAN and pushes discovered datasets to the registry.  The necessary aspect definitions
     * are first created in the registry.  If creation of an aspect definition fails (after all retries
     * have been exhausted), no records will be created and the promise will resolve with a
     * {@link CkanConnectionResult} containing the errors.
     * 
     * @returns {Promise<CkanConnectionResult>}
     * 
     * @memberOf CkanConnector
     */
    async run(): Promise<CkanConnectionResult> {
        const connectionResult = new CkanConnectionResult();

        function tryit<T>(f: () => T): T {
            try {
                return f();
            } catch (e) {
                connectionResult.errors.push(e);
                return undefined;
            }
        }

        const templates = this.aspectBuilders.map(builder => ({
            id: builder.aspectDefinition.id,
            builderFunction: tryit(() => new Function('setup', 'dataset', 'source', 'moment', builder.builderFunctionString)),
            setupResult: builder.setupFunctionString ? tryit(() => new Function('moment', builder.setupFunctionString)(moment)) : undefined
        }));

        // If there were errors initializing the aspect definitions, don't try to create records.
        if (connectionResult.errors.length > 0) {
            return connectionResult;
        }

        const aspectBuilderPage = AsyncPage.create<AspectBuilder[]>(current => current ? undefined : Promise.resolve(this.aspectBuilders));
        await forEachAsync(aspectBuilderPage, this.maxConcurrency, async aspectBuilder => {
            const aspectDefinitionOrError = await this.registry.putAspectDefinition(aspectBuilder.aspectDefinition);
            if (aspectDefinitionOrError instanceof Error) {
                connectionResult.errors.push(aspectDefinitionOrError);
            } else {
                connectionResult.aspectDefinitionsConnected++;
            }
        });

        // If there were errors creating the aspect definitions, don't try to create records.
        if (connectionResult.errors.length > 0) {
            return connectionResult;
        }

        const packagePages = this.ckan.packageSearch(this.ignoreHarvestSources);
        const datasets = packagePages.map(packagePage => packagePage.result.results);

        await forEachAsync(datasets, this.maxConcurrency, async dataset => {
            const recordOrError = await this.registry.putRecord(this.datasetToRecord(connectionResult, templates, dataset));
            if (recordOrError instanceof Error) {
                connectionResult.errors.push(recordOrError);
            } else {
                ++connectionResult.datasetsConnected;
            }
        });

        return connectionResult;
    }

    private datasetToRecord(connectionResult: CkanConnectionResult, templates: CompiledAspect[], dataset: CkanDataset): Record {
        const aspects: Aspects = {};
        templates.forEach(aspect => {
            try {
                const aspectValue = aspect.builderFunction(aspect.setupResult, dataset, this.ckan, moment);
                if (aspectValue !== undefined) {
                    aspects[aspect.id] = aspectValue;
                }
            } catch(e) {
                connectionResult.errors.push(e);
            }
        });

        return {
            id: dataset.id,
            name: dataset.title || dataset.name,
            aspects: aspects
        };
    }
}