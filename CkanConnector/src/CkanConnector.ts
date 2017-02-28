import { AspectDefinition, AspectDefinitionsApi, Record } from './generated/registry/api';
import Ckan, { CkanThing, CkanDataset, CkanResource } from './Ckan';
import Registry from './Registry';
import AsyncPage, { forEachAsync } from './AsyncPage';
import * as moment from 'moment';
import createServiceError from './createServiceError';

export interface AspectBuilder {
    aspectDefinition: AspectDefinition,
    builderFunctionString: string,
    setupFunctionString?: string
}

export interface CkanConnectorOptions {
    ckan: Ckan,
    registry: Registry,
    datasetAspectBuilders?: AspectBuilder[],
    distributionAspectBuilders?: AspectBuilder[],
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

interface ProblemReport {
    title: string,
    message?: string,
    additionalInfo?: any
}

interface ReportProblem {
    (title: string, message?: string, additionalInfo?: any): void
}

export class CkanConnectionResult {
    public aspectDefinitionsConnected: number = 0;
    public datasetsConnected: number = 0;
    public distributionsConnected: number = 0;
    public errors: Error[] = [];
}

export default class CkanConnector {
    private ckan: Ckan;
    private registry: Registry;
    private ignoreHarvestSources: string[];
    private maxConcurrency: number;

    public datasetAspectBuilders: AspectBuilder[]
    public distributionAspectBuilders: AspectBuilder[]

    constructor({
        ckan,
        registry,
        datasetAspectBuilders = [],
        distributionAspectBuilders = [],
        ignoreHarvestSources = [],
        maxConcurrency = 6
    }: CkanConnectorOptions) {
        this.ckan = ckan;
        this.registry = registry;
        this.datasetAspectBuilders = datasetAspectBuilders.slice();
        this.distributionAspectBuilders = distributionAspectBuilders.slice();
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

        const datasetTemplates = this.datasetAspectBuilders.map(builder => ({
            id: builder.aspectDefinition.id,
            builderFunction: tryit(() => new Function('setup', 'dataset', 'unused', 'source', 'moment', 'reportProblem', builder.builderFunctionString)),
            setupResult: builder.setupFunctionString ? tryit(() => new Function('moment', builder.setupFunctionString)(moment)) : undefined
        }));

        const distributionTemplates = this.distributionAspectBuilders.map(builder => ({
            id: builder.aspectDefinition.id,
            builderFunction: tryit(() => new Function('setup', 'resource', 'dataset', 'source', 'moment', 'reportProblem', builder.builderFunctionString)),
            setupResult: builder.setupFunctionString ? tryit(() => new Function('moment', builder.setupFunctionString)(moment)) : undefined
        }));

        // If there were errors initializing the aspect definitions, don't try to create records.
        if (connectionResult.errors.length > 0) {
            return connectionResult;
        }

        const aspectBuilderPage = AsyncPage.create<AspectBuilder[]>(current => current ? undefined : Promise.resolve(this.datasetAspectBuilders.concat(this.distributionAspectBuilders)));
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
            const recordOrError = await this.registry.putRecord(this.ckanToRecord(connectionResult, datasetTemplates, dataset, undefined));
            if (recordOrError instanceof Error) {
                connectionResult.errors.push(recordOrError);
            } else {
                ++connectionResult.datasetsConnected;

                for (let i = 0; i < dataset.resources.length; ++i) {
                    const resource = dataset.resources[i];
                    const resourceRecordOrError = await this.registry.putRecord(this.ckanToRecord(connectionResult, distributionTemplates, resource, dataset));
                    if (resourceRecordOrError instanceof Error) {
                        connectionResult.errors.push(resourceRecordOrError);
                    } else {
                        ++connectionResult.distributionsConnected;
                    }
                }
            }
        });

        return connectionResult;
    }

    private ckanToRecord<T extends CkanThing, TParent extends CkanThing>(connectionResult: CkanConnectionResult, templates: CompiledAspect[], ckanRecord: T, ckanParent: TParent): Record {
        const problems: ProblemReport[] = [];
        function reportProblem(title: string, message?: string, additionalInfo?: any) {
            problems.push({ title, message, additionalInfo });
        }

        const aspects: Aspects = {};
        templates.forEach(aspect => {
            try {
                const aspectValue = aspect.builderFunction(aspect.setupResult, ckanRecord, ckanParent, this.ckan, moment, reportProblem);
                if (aspectValue !== undefined) {
                    aspects[aspect.id] = aspectValue;
                }
            } catch(e) {
                const exception = createServiceError(e);
                reportProblem('Exception while creating aspect ' + aspect.id, exception.toString());
            }
        });

        if (problems.length > 0) {
            if (!aspects['source']) {
                aspects['source'] = {};
            }
            aspects['source'].problems = problems;
        }

        return {
            id: ckanRecord.id,
            name: ckanRecord['title'] || ckanRecord.name,
            aspects: aspects
        };
    }
}