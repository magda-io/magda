import { AspectDefinition, AspectDefinitionsApi, Record } from '../../registry-api/generated/typescript/api';
import Ckan, { CkanThing, CkanDataset, CkanResource } from './Ckan';
import Registry from './Registry';
import AsyncPage, { forEachAsync } from './AsyncPage';
import * as moment from 'moment';
import createServiceError from './createServiceError';
import * as URI from 'urijs';

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

interface CompiledAspects {
    parameterNames: string[];
    parameters: BuilderFunctionParameters;
    aspects: CompiledAspect[];
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

class BuilderFunctionLibraries {
    /**
     * The [moment.js](https://momentjs.com) library.
     *
     * @type {moment.Moment}
     * @memberOf BuilderFunctionLibraries
     */
    moment: typeof moment = undefined;

    /**
     * The [URI.js](https://medialize.github.io/URI.js/) library.
     *
     * @type {typeof URI}
     * @memberOf BuilderFunctionLibraries
     */
    URI: typeof URI = undefined;
}

class BuilderSetupFunctionParameters {
    /**
     * The source of this item for which we are building aspects.
     *
     * @type {Ckan}
     * @memberOf BuilderFunctionParameters
     */
    source: Ckan = undefined;

    /**
     * The registry to be populated with records created from the CKAN datasets and resources.
     *
     * @type {Registry}
     * @memberOf BuilderSetupFunctionParameters
     */
    registry: Registry = undefined;

    /**
     * Provides access to utility libraries that may be helpful in setting up the builder.
     *
     * @type {BuilderFunctionLibraries}
     * @memberOf BuilderFunctionParameters
     */
    libraries: BuilderFunctionLibraries = undefined;

    [propName: string]: any;
}

abstract class BuilderFunctionParameters {
    /**
     * The result of invoking the {@link AspectBuilder#setupFunctionString}, or undefined if there is no
     * {@link AspectBuilder#setupFunctionString} defined for this builder.
     *
     * @type {*}
     * @memberOf BuilderFunctionParameters
     */
    setup: any = undefined;


    /**
     * The source of this item for which we are building aspects.
     *
     * @type {Ckan}
     * @memberOf BuilderFunctionParameters
     */
    source: Ckan = undefined;

    /**
     * The registry to be populated with records created from the CKAN datasets and resources.
     *
     * @type {Registry}
     * @memberOf BuilderSetupFunctionParameters
     */
    registry: Registry = undefined;

    /**
     * Reports a non-fatal problem creating an aspect.
     *
     * @type {ReportProblem}
     * @memberOf BuilderFunctionParameters
     */
    reportProblem: ReportProblem = undefined;

    /**
     * Provides access to utility libraries that may be helpful in building aspects.
     *
     * @type {BuilderFunctionLibraries}
     * @memberOf BuilderFunctionParameters
     */
    libraries: BuilderFunctionLibraries = undefined;

    [propName: string]: any;

    abstract getCkanThing(): CkanThing;
}

class DatasetBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The CKAN dataset from which to build aspects.
     *
     * @type {CkanDataset}
     * @memberOf DatasetBuilderFunctionParameters
     */
    dataset: CkanDataset = undefined;

    getCkanThing(): CkanDataset {
        return this.dataset;
    }
}

class DistributionBuilderFunctionParameters extends BuilderFunctionParameters {
    /**
     * The CKAN resource from which to build aspects.
     *
     * @type {CkanResource}
     * @memberOf DistributionBuilderFunctionParameters
     */
    resource: CkanResource = undefined;

    /**
     * The CKAN dataset that owns the resource.
     *
     * @type {CkanDataset}
     * @memberOf DatasetBuilderFunctionParameters
     */
    dataset: CkanDataset = undefined;

    getCkanThing(): CkanResource {
        return this.resource;
    }
}

export class CkanConnectionResult {
    public aspectDefinitionsConnected: number = 0;
    public datasetsConnected: number = 0;
    public distributionsConnected: number = 0;
    public errors: { aspectDefinitionId?: string, datasetId?: string, resourceId?: string, error: Error }[] = [];
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

        const libraries = new BuilderFunctionLibraries();
        libraries.moment = moment;
        libraries.URI = URI;

        const setupParameters = new BuilderSetupFunctionParameters();
        setupParameters.libraries = libraries;
        setupParameters.source = this.ckan;

        const datasetParameters = new DatasetBuilderFunctionParameters();
        datasetParameters.libraries = libraries;
        datasetParameters.source = this.ckan;
        datasetParameters.registry = this.registry;

        const distributionParameters = new DistributionBuilderFunctionParameters();
        distributionParameters.libraries = libraries;
        distributionParameters.source = this.ckan;
        distributionParameters.registry = this.registry;

        const datasetAspects = buildersToCompiledAspects(connectionResult, this.datasetAspectBuilders, setupParameters, datasetParameters);
        const distributionAspects = buildersToCompiledAspects(connectionResult, this.distributionAspectBuilders, setupParameters, distributionParameters);

        // If there were errors initializing the aspect definitions, don't try to create records.
        if (connectionResult.errors.length > 0) {
            return connectionResult;
        }

        const aspectBuilderPage = AsyncPage.create<AspectBuilder[]>(current => current ? undefined : Promise.resolve(this.datasetAspectBuilders.concat(this.distributionAspectBuilders)));
        await forEachAsync(aspectBuilderPage, this.maxConcurrency, async aspectBuilder => {
            const aspectDefinitionOrError = await this.registry.putAspectDefinition(aspectBuilder.aspectDefinition);
            if (aspectDefinitionOrError instanceof Error) {
                connectionResult.errors.push({
                    aspectDefinitionId: aspectBuilder.aspectDefinition.id,
                    error: aspectDefinitionOrError
                });
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
            datasetParameters.dataset = dataset;
            const recordOrError = await this.registry.putRecord(this.ckanToRecord(connectionResult, datasetAspects));
            if (recordOrError instanceof Error) {
                connectionResult.errors.push({
                    datasetId: dataset.id,
                    resourceId: null,
                    error: recordOrError
                });
            } else {
                ++connectionResult.datasetsConnected;

                for (let i = 0; i < dataset.resources.length; ++i) {
                    const resource = dataset.resources[i];
                    distributionParameters.dataset = dataset;
                    distributionParameters.resource = resource;
                    const resourceRecordOrError = await this.registry.putRecord(this.ckanToRecord(connectionResult, distributionAspects));
                    if (resourceRecordOrError instanceof Error) {
                        connectionResult.errors.push({
                            datasetId: dataset.id,
                            resourceId: resource.id,
                            error: resourceRecordOrError
                        });
                    } else {
                        ++connectionResult.distributionsConnected;
                    }
                }
            }
        });

        return connectionResult;
    }

    private ckanToRecord(connectionResult: CkanConnectionResult, aspects: CompiledAspects): Record {
        const problems: ProblemReport[] = [];

        function reportProblem(title: string, message?: string, additionalInfo?: any) {
            problems.push({ title, message, additionalInfo });
        }

        aspects.parameters.reportProblem = reportProblem;

        const generatedAspects: Aspects = {};
        aspects.aspects.forEach(aspect => {
            try {
                aspects.parameters.setup = aspect.setupResult;
                const aspectValue = aspect.builderFunction(...aspects.parameterNames.map(parameter => aspects.parameters[parameter]));
                if (aspectValue !== undefined) {
                    generatedAspects[aspect.id] = aspectValue;
                }
            } catch(e) {
                const exception = createServiceError(e);
                reportProblem('Exception while creating aspect ' + aspect.id, exception.toString());
            }
        });

        if (problems.length > 0) {
            if (!generatedAspects['source']) {
                generatedAspects['source'] = {};
            }
            generatedAspects['source'].problems = problems;
        }

        const ckanThing = aspects.parameters.getCkanThing();

        return {
            id: ckanThing.id,
            name: ckanThing['title'] || ckanThing.name,
            aspects: generatedAspects
        };
    }
}

function buildersToCompiledAspects(connectionResult: CkanConnectionResult, builders: AspectBuilder[], setupParameters: BuilderSetupFunctionParameters, buildParameters: BuilderFunctionParameters): CompiledAspects {
    const setupParameterNames = Object.keys(setupParameters);
    const buildParameterNames = Object.keys(buildParameters);

    return {
        parameterNames: buildParameterNames,
        parameters: buildParameters,
        aspects: builders.map(builder => {
            try {
                let setupResult = undefined;
                if (builder.setupFunctionString) {
                    const setupFunction = new Function(...setupParameterNames, builder.setupFunctionString);
                    setupResult = setupFunction.apply(undefined, setupParameterNames.map(name => setupParameters[name]));
                }

                const builderFunction = new Function(...buildParameterNames, builder.builderFunctionString);

                return {
                    id: builder.aspectDefinition.id,
                    builderFunction: builderFunction,
                    setupResult: setupResult
                };
            } catch(e) {
                connectionResult.errors.push(e);
                return undefined;
            }
        })
    };
}
