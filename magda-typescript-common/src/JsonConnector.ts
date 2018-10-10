import { AspectDefinition, Record } from "./generated/registry/api";
import AspectCreationFailure from "./AspectCreationFailure";
import AsyncPage, { forEachAsync, asyncPageToArray } from "./AsyncPage";
import ConnectorRecordId from "./ConnectorRecordId";
import ConnectionResult from "./ConnectionResult";
import RecordCreationFailure from "./RecordCreationFailure";
import JsonTransformer from "./JsonTransformer";
import Registry from "./registry/AuthorizedRegistryClient";
import unionToThrowable from "./util/unionToThrowable";

import * as express from "express";
import * as fs from "fs";
import * as path from "path";
import * as process from "process";
import * as uuid from "uuid";

/**
 * A base class for connectors for most any JSON-based catalog source.
 */
export default class JsonConnector {
    public readonly source: ConnectorSource;
    public readonly transformer: JsonTransformer;
    public readonly registry: Registry;
    public readonly maxConcurrency: number;
    public readonly sourceTag?: string;

    constructor({
        source,
        transformer,
        registry,
        maxConcurrency = 1,
        sourceTag = uuid.v4()
    }: JsonConnectorOptions) {
        this.source = source;
        this.transformer = transformer;
        this.registry = registry;
        this.maxConcurrency = maxConcurrency;
        this.sourceTag = sourceTag;
    }

    async createAspectDefinitions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const allAspectDefinitions = this.transformer.getRequiredAspectDefinitions();

        const aspectBuilderPage = AsyncPage.single<AspectDefinition[]>(
            allAspectDefinitions
        );
        await forEachAsync(
            aspectBuilderPage,
            this.maxConcurrency,
            async aspectDefinition => {
                const aspectDefinitionOrError = await this.registry.putAspectDefinition(
                    aspectDefinition
                );
                if (aspectDefinitionOrError instanceof Error) {
                    result.aspectDefinitionFailures.push(
                        new AspectCreationFailure(
                            aspectDefinition.id,
                            aspectDefinitionOrError
                        )
                    );
                } else {
                    ++result.aspectDefinitionsConnected;
                }
            }
        );

        return result;
    }

    async createOrganization(
        organizationJson: object
    ): Promise<Record | Error> {
        return this.putRecord(
            this.transformer.organizationJsonToRecord(organizationJson)
        );
    }

    async createDataset(datasetJson: object): Promise<Record | Error> {
        return this.putRecord(
            this.transformer.datasetJsonToRecord(datasetJson)
        );
    }

    async createDistribution(
        distributionJson: object,
        datasetJson: object
    ): Promise<Record | Error> {
        return this.putRecord(
            this.transformer.distributionJsonToRecord(
                distributionJson,
                datasetJson
            )
        );
    }

    async createOrganizations(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        if (this.source.hasFirstClassOrganizations) {
            const organizations = this.source.getJsonFirstClassOrganizations();
            await forEachAsync(
                organizations,
                this.maxConcurrency,
                async organization => {
                    const recordOrError = await this.createOrganization(
                        organization
                    );
                    if (recordOrError instanceof Error) {
                        result.organizationFailures.push(
                            new RecordCreationFailure(
                                this.transformer.getIdFromJsonOrganization(
                                    organization,
                                    this.source.id
                                ),
                                undefined,
                                recordOrError
                            )
                        );
                    } else {
                        ++result.organizationsConnected;
                    }
                }
            );
        }

        return result;
    }

    async createDatasetsAndDistributions(): Promise<ConnectionResult> {
        const result = new ConnectionResult();

        const datasets = this.source.getJsonDatasets();
        await forEachAsync(datasets, this.maxConcurrency, async dataset => {
            const record = this.transformer.datasetJsonToRecord(dataset);

            const distributions = this.source.getJsonDistributions(dataset);
            if (distributions) {
                const distributionIds: ConnectorRecordId[] = [];
                await forEachAsync(distributions, 1, async distribution => {
                    const recordOrError = await this.createDistribution(
                        distribution,
                        dataset
                    );
                    if (recordOrError instanceof Error) {
                        result.distributionFailures.push(
                            new RecordCreationFailure(
                                this.transformer.getIdFromJsonDistribution(
                                    distribution,
                                    dataset,
                                    this.source.id
                                ),
                                this.transformer.getIdFromJsonDataset(
                                    dataset,
                                    this.source.id
                                ),
                                recordOrError
                            )
                        );
                    } else {
                        ++result.distributionsConnected;
                        distributionIds.push(
                            this.transformer.getIdFromJsonDistribution(
                                distribution,
                                dataset,
                                this.source.id
                            )
                        );
                    }
                });

                record.aspects["dataset-distributions"] = {
                    distributions: distributionIds.map(id => id.toString())
                };
            }

            if (this.source.hasFirstClassOrganizations) {
                const publisher = this.source.getJsonDatasetPublisherId(
                    dataset
                );
                if (publisher) {
                    record.aspects["dataset-publisher"] = {
                        publisher: new ConnectorRecordId(
                            publisher,
                            "Organization",
                            this.source.id
                        ).toString()
                    };
                }
            } else {
                const publisher = await this.source.getJsonDatasetPublisher(
                    dataset
                );
                if (publisher) {
                    const publisherId = this.transformer.getIdFromJsonOrganization(
                        publisher,
                        this.source.id
                    );

                    if (publisherId) {
                        const recordOrError = await this.createOrganization(
                            publisher
                        );
                        if (recordOrError instanceof Error) {
                            result.organizationFailures.push(
                                new RecordCreationFailure(
                                    publisherId,
                                    undefined,
                                    recordOrError
                                )
                            );
                        } else {
                            record.aspects["dataset-publisher"] = {
                                publisher: publisherId.toString()
                            };
                            ++result.organizationsConnected;
                        }
                    }
                }
            }

            const recordOrError = await this.putRecord(record);
            if (recordOrError instanceof Error) {
                result.datasetFailures.push(
                    new RecordCreationFailure(
                        this.transformer.getIdFromJsonDataset(
                            dataset,
                            this.source.id
                        ),
                        undefined,
                        recordOrError
                    )
                );
            } else {
                ++result.datasetsConnected;
            }
        });

        return result;
    }

    async trimRecords(): Promise<ConnectionResult> {
        return this.registry
            .deleteBySource(this.sourceTag, this.source.id)
            .then(unionToThrowable)
            .then(deletionResult => {
                const result = new ConnectionResult();

                if (deletionResult !== "Processing") {
                    result.recordsTrimmed = deletionResult.count;
                } else {
                    result.trimStillProcessing = true;
                }

                return result;
            });
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
        const recordsTrimmedResult = await this.trimRecords();

        return ConnectionResult.combine(
            aspectResult,
            organizationResult,
            datasetAndDistributionResult,
            recordsTrimmedResult
        );
    }

    runInteractive(options: JsonConnectorRunInteractiveOptions) {
        const transformerForBrowserPath = path.resolve(
            process.cwd(),
            "dist",
            "createTransformerForBrowser.js"
        );
        if (!fs.existsSync(transformerForBrowserPath)) {
            throw new Error(
                "Cannot run this connector in interactive mode because dist/createTransformerForBrowser.js does not exist."
            );
        }

        var app = express();
        app.use(require("body-parser").json());

        if (options.timeoutSeconds > 0) {
            this.shutdownOnIdle(app, options.timeoutSeconds);
        }

        app.get("/v0/status", (req, res) => {
            res.send("OK");
        });

        app.get("/v0/config", (req, res) => {
            res.send(options.transformerOptions);
        });

        app.get("/v0/datasets/:id", (req, res) => {
            this.source.getJsonDataset(req.params.id).then(function(dataset) {
                res.send(dataset);
            });
        });

        app.get("/v0/datasets/:id/distributions", (req, res) => {
            this.source.getJsonDataset(req.params.id).then(dataset => {
                return asyncPageToArray(
                    this.source.getJsonDistributions(dataset)
                ).then(distributions => {
                    res.send(distributions);
                });
            });
        });

        app.get("/v0/datasets/:id/publisher", (req, res) => {
            this.source.getJsonDataset(req.params.id).then(dataset => {
                return this.source
                    .getJsonDatasetPublisher(dataset)
                    .then(publisher => {
                        res.send(publisher);
                    });
            });
        });

        app.get("/v0/search/datasets", (req, res) => {
            asyncPageToArray(
                this.source.searchDatasetsByTitle(req.query.title, 10)
            ).then(datasets => {
                res.send(datasets);
            });
        });

        if (this.source.hasFirstClassOrganizations) {
            app.get("/v0/organizations/:id", (req, res) => {
                this.source
                    .getJsonFirstClassOrganization(req.params.id)
                    .then(function(organization) {
                        res.send(organization);
                    });
            });

            app.get("/v0/search/organizations", (req, res) => {
                asyncPageToArray(
                    this.source.searchFirstClassOrganizationsByTitle(
                        req.query.title,
                        5
                    )
                ).then(organizations => {
                    res.send(organizations);
                });
            });
        }

        app.get("/v0/test-harness.js", function(req, res) {
            res.sendFile(transformerForBrowserPath);
        });

        app.listen(options.listenPort);
        console.log(`Listening on port ${options.listenPort}.`);
    }

    private shutdownOnIdle(express: express.Express, timeoutSeconds: number) {
        // Arrange to shut down the Express server after the idle timeout expires.
        let timeoutId: NodeJS.Timer;

        function resetTimeout() {
            if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
            }

            timeoutId = setTimeout(function() {
                console.log("Shutting down due to idle timeout.");

                // TODO: Should just shut down the HTTP server instead of the whole process.
                process.exit(0);
            }, timeoutSeconds * 1000);
        }

        express.use(function(req, res, next) {
            resetTimeout();
            next();
        });

        resetTimeout();
    }

    private async putRecord(record: Record): Promise<Record | Error> {
        if (!record.id) {
            const noIdMessage = `Tried to put record with no id: ${JSON.stringify(
                record
            )}`;

            console.error(noIdMessage);

            return Promise.resolve(new Error(noIdMessage));
        }

        return this.registry.putRecord({
            ...record,
            sourceTag: this.sourceTag
        });
    }
}

export interface ConnectorSource {
    /**
     * The ID of the source. This is used to prefix IDs of datasets, distributions, and organizations
     * found in this source.
     */
    readonly id: string;

    /**
     * The user-friendly name of the source.
     */
    readonly name: string;

    /**
     * Get all of the datasets as pages of objects.
     *
     * @returns {AsyncPage<any[]>} A page of datasets.
     */
    getJsonDatasets(): AsyncPage<any[]>;

    /**
     * Get a particular dataset given its ID.
     *
     * @param {string} id The ID of the dataset.
     * @returns {Promise<any>} The dataset object with the given ID.
     */
    getJsonDataset(id: string): Promise<any>;

    /**
     * Search datasets for those that have a particular case-insensitive string
     * in their title.
     *
     * @param {string} title The string to search for the in the title.
     * @param {number} maxResults The maximum number of results to return.
     * @returns {AsyncPage<any[]>} A page of matching datasets.
     */
    searchDatasetsByTitle(title: string, maxResults: number): AsyncPage<any[]>;

    /**
     * Gets the distributions of a given dataset.
     *
     * @param {object} dataset The dataset.
     * @returns {AsyncPage<any[]>} A page of distributions of the dataset.
     */
    getJsonDistributions(dataset: any): AsyncPage<any[]>;

    /**
     * True if the source provides organizations as first-class objects that can be enumerated and retrieved
     * by ID.  False if organizations are just fields on datasets or distributions, or if they're not
     * available at all.
     */
    readonly hasFirstClassOrganizations: boolean;

    /**
     * Enumerates first-class organizations.  If {@link hasFirstClassOrganizations} is false, this
     * method returns undefined.
     *
     * @returns {AsyncPage<any[]>} A page of organizations, or undefined if first-class organizations are not available.
     */
    getJsonFirstClassOrganizations(): AsyncPage<any[]>;

    /**
     * Gets a first-class organization by ID. If {@link hasFirstClassOrganizations} is false, this
     * method returns undefined.
     *
     * @param {string} id The ID of the organization to retrieve.
     * @returns {Promise<any>} A promise for the organization, or undefined if first-class organizations are not available.
     */
    getJsonFirstClassOrganization(id: string): Promise<any>;

    /**
     * Search first-class organizations for those that have a particular case-insensitive string
     * in their title.
     *
     * @param {string} title The string to search for the in the title.
     * @param {number} maxResults The maximum number of results to return.
     * @returns {AsyncPage<any[]>} A page of matching organizations, or undefined if first-class organizations are not available.
     */
    searchFirstClassOrganizationsByTitle(
        title: string,
        maxResults: number
    ): AsyncPage<any[]>;

    /**
     * Gets the ID of the publisher of this dataset.  This method will return undefined if {@link hasFirstClassOrganizations}
     * is false because non-first-class organizations do not have IDs.
     *
     * @param {any} dataset The dataset from which to get the publisher ID.
     * @returns {string} The ID of the dataset's publisher.
     */
    getJsonDatasetPublisherId(dataset: any): string;

    /**
     * Gets the publisher organization of this dataset.
     *
     * @param {any} dataset The dataset from which to get the publisher.
     * @returns {Promise<object>} A promise for the organization that published this dataset.
     */
    getJsonDatasetPublisher(dataset: any): Promise<any>;
}

export interface JsonConnectorOptions {
    source: ConnectorSource;
    transformer: JsonTransformer;
    registry: Registry;
    maxConcurrency?: number;
    sourceTag?: string;
}

export interface JsonConnectorRunInteractiveOptions {
    timeoutSeconds: number;
    listenPort: number;
    transformerOptions: any;
}
