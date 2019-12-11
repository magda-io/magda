import URI from "urijs";

export interface DapUrlBuilderOptions {
    id: string;
    name?: string;
    baseUrl: string;
    apiBaseUrl?: string;
}

export default class DapUrlBuilder {
    public readonly id: string;
    public readonly name: string;
    public readonly baseUrl: uri.URI;
    public readonly apiBaseUrl: uri.URI;

    constructor(options: DapUrlBuilderOptions) {
        this.id = options.id;
        this.name = options.name || options.id;
        this.baseUrl = new URI(options.baseUrl);

        if (options.apiBaseUrl) {
            this.apiBaseUrl = new URI(options.apiBaseUrl);
        } else {
            this.apiBaseUrl = this.baseUrl.clone().segment("collections");
        }
    }

    // Following the DAP API defination to customed the URL builder: https://confluence.csiro.au/display/daphelp/Web+Services+Interface
    public getPackageSearchUrl(): string {
        return this.apiBaseUrl.clone().toString();
    }

    public getPackageShowUrl(id: string): string {
        return this.apiBaseUrl
            .clone()
            .segment("/")
            .segment(id)
            .toString();
    }

    public getResourceShowUrl(id: string): string {
        return this.apiBaseUrl
            .clone()
            .addSearch("id", id)
            .segment("data")
            .toString();
    }
}
