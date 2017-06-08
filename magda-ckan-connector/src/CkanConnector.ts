import AsyncPage from '@magda/typescript-common/lib/AsyncPage';
import JsonConnector, { JsonConnectorOptions } from '@magda/typescript-common/lib/JsonConnector';
import Ckan from './Ckan';

export default class CkanConnector extends JsonConnector {
    private ckan: Ckan;
    private ignoreHarvestSources: string[];

    constructor(options: CkanConnectorOptions) {
        super(options);
        this.ckan = options.source;
        this.ignoreHarvestSources = (options.ignoreHarvestSources || []).slice();
    }

    protected getJsonDatasetPublisher(dataset: any): any {
        if (!dataset.organization) {
            return undefined;
        }
        return dataset.organization.id;
    }

    protected getJsonOrganizations(): AsyncPage<object[]> {
        const organizationPages = this.ckan.organizationList();
        return organizationPages.map((organizationPage) => organizationPage.result);
    }

    protected getJsonDatasets(): AsyncPage<object[]> {
        const packagePages = this.ckan.packageSearch(this.ignoreHarvestSources);
        return packagePages.map((packagePage) => packagePage.result.results);
    }

    protected getJsonDistributions(dataset: any): AsyncPage<object[]> {
        return AsyncPage.single<object[]>(dataset.resources || []);
    }

    protected getIdFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.id;
    }

    protected getIdFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.id;
    }

    protected getIdFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.id;
    }

    protected getNameFromJsonOrganization(jsonOrganization: any): string {
        return jsonOrganization.display_name || jsonOrganization.title || jsonOrganization.name || jsonOrganization.id;
    }

    protected getNameFromJsonDataset(jsonDataset: any): string {
        return jsonDataset.title || jsonDataset.name || jsonDataset.id;
    }

    protected getNameFromJsonDistribution(jsonDistribution: any, jsonDataset: any): string {
        return jsonDistribution.name || jsonDistribution.id;
    }
}

export interface CkanConnectorOptions extends JsonConnectorOptions {
    source: Ckan;
    ignoreHarvestSources?: string[];
}
