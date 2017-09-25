import { AspectDefinition, Record } from './generated/registry/api';
import AsyncPage, { forEachAsync } from './AsyncPage';
import ConnectionResult from './ConnectionResult';
import CreationFailure from './CreationFailure';
import JsonTransformer from './JsonTransformer';
import Registry from './Registry';

/**
 * A base class for connectors for most any JSON-based catalog source.
 */
export default class JsonConnector {
    public readonly source: IConnectorSource;
    public readonly transformer: JsonTransformer;
    public readonly registry: Registry;
    public readonly maxConcurrency: number;

    constructor({
        source,
        transformer,
        registry,
        maxConcurrency = 6
    }: JsonConnectorOptions) {
        this.source = source;
        this.transformer = transformer;
        this.registry = registry;
        this.maxConcurrency = maxConcurrency;
    }

    async createAspectDefinitions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const allAspectDefinitions = this.transformer.getRequiredAspectDefinitions();

        const aspectBuilderPage = AsyncPage.single<AspectDefinition[]>(allAspectDefinitions);
        await forEachAsync(aspectBuilderPage, this.maxConcurrency, async aspectDefinition => {
            const aspectDefinitionOrError = await this.registry.putAspectDefinition(aspectDefinition);
            if (aspectDefinitionOrError instanceof Error) {
                result.aspectDefinitionFailures.push(new CreationFailure(aspectDefinition.id, undefined, aspectDefinitionOrError));
            } else {
                ++result.aspectDefinitionsConnected;
            }
        });

        return result;
    }

    async createOrganization(organizationJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.transformer.organizationJsonToRecord(organizationJson));
    }

    async createDataset(datasetJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.transformer.datasetJsonToRecord(datasetJson));
    }

    async createDistribution(distributionJson: object, datasetJson: object): Promise<Record | Error> {
        return this.registry.putRecord(this.transformer.distributionJsonToRecord(distributionJson, datasetJson));
    }

    async createOrganizations(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const organizations = this.source.getJsonOrganizations();
        await forEachAsync(organizations, this.maxConcurrency, async organization => {
            const recordOrError = await this.createOrganization(organization);
            if (recordOrError instanceof Error) {
                result.organizationFailures.push(new CreationFailure(
                    this.transformer.getIdFromJsonOrganization(organization),
                    undefined,
                    recordOrError));
            } else {
                ++result.organizationsConnected;
            }
        });

        return result;
    }

    async createDatasetsAndDistributions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const datasets = this.source.getJsonDatasets();
        await forEachAsync(datasets, this.maxConcurrency, async dataset => {
            const record = this.transformer.datasetJsonToRecord(dataset);

            const distributions = this.source.getJsonDistributions(dataset);
            if (distributions) {
                const distributionIds: string[] = [];
                await forEachAsync(distributions, 1, async distribution => {
                    const recordOrError = await this.createDistribution(distribution, dataset);
                    if (recordOrError instanceof Error) {
                        result.distributionFailures.push(new CreationFailure(
                            this.transformer.getIdFromJsonDistribution(distribution, dataset),
                            this.transformer.getIdFromJsonDataset(dataset),
                            recordOrError));
                    } else {
                        ++result.distributionsConnected;
                        distributionIds.push(this.transformer.getIdFromJsonDistribution(distribution, dataset));
                    }
                });

                record.aspects['dataset-distributions'] = {
                    distributions: distributionIds
                };
            }

            const publisher = this.transformer.getJsonDatasetPublisher(dataset);
            if (typeof publisher === 'string' || publisher instanceof String) {
                record.aspects['dataset-publisher'] = {
                    publisher: publisher
                };
            } else if (typeof publisher === 'object') {
                const recordOrError = await this.createOrganization(publisher);
                if (recordOrError instanceof Error) {
                    result.organizationFailures.push(new CreationFailure(
                        this.transformer.getIdFromJsonOrganization(publisher),
                        undefined,
                        recordOrError));
                } else {
                    record.aspects['dataset-publisher'] = {
                        publisher: this.transformer.getIdFromJsonOrganization(publisher)
                    };
                    ++result.organizationsConnected;
                }
            }

            const recordOrError = await this.registry.putRecord(record);
            if (recordOrError instanceof Error) {
                result.datasetFailures.push(new CreationFailure(
                    this.transformer.getIdFromJsonDataset(dataset),
                    undefined,
                    recordOrError));
            } else {
                ++result.datasetsConnected;
            }
        });

        return result;
    }

    /**
     * Runs the connector, creating aspect definitions, organizations, datasets, and distributions in the
     * registry as necessary.
     *
     * @returns {Promise<ConnectionResult>}
     * @memberof JsonConnector
     */
    async run(): Promise<ConnectionResult> {
        const aspectResult = await this.createAspectDefinitions();
        const organizationResult = await this.createOrganizations();
        const datasetAndDistributionResult = await this.createDatasetsAndDistributions();
        return ConnectionResult.combine(aspectResult, organizationResult, datasetAndDistributionResult);
    }
}

export interface IConnectorSource {
    getJsonOrganizations(): AsyncPage<object[]>;
    getJsonDatasets(): AsyncPage<object[]>;
    getJsonDistributions(dataset: object): AsyncPage<object[]>;
}

export interface JsonConnectorOptions {
    source: IConnectorSource,
    transformer: JsonTransformer,
    registry: Registry,
    maxConcurrency?: number
}
