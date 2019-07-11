import * as URI from "urijs";

export interface EsriPortalUrlBuilderOptions {
    id: string;
    name?: string;
    baseUrl: string;
}

export default class EsriPortalUrlBuilder {
    public readonly id: string;
    public readonly name: string;
    public readonly baseUrl: uri.URI;
    public readonly apiBaseUrl: uri.URI;

    constructor(options: EsriPortalUrlBuilderOptions) {
        this.id = options.id;
        this.name = options.name || options.id;
        this.baseUrl = new URI(options.baseUrl);
        this.apiBaseUrl = this.baseUrl.clone().segment("sharing/rest");
    }

    // https://someportal/arcgis/sharing/rest/search?f=pjson&q=type:'Map Service'
    public getDataSearchUrl(): string {
        return this.apiBaseUrl
            .clone()
            .segment("search")
            .addSearch({ f: "pjson", q: 'type:"Map Service"' })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/portals/self?f=pjson
    public getOrganizationShowUrl(): string {
        return this.apiBaseUrl
            .clone()
            .segment("portals/self")
            .addSearch({ f: "pjson" })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/content/items/ea532dd8876b4646aa2ab49533e458aa?f=pjson
    public getContentItemUrl(id: string): string {
        // TODO Sometimes getting an id of undefined...
        return this.apiBaseUrl
            .clone()
            .segment("content/items")
            .segment(id)
            .addSearch({ f: "pjson" })
            .toString();
    }

    // https://someserver/arcgis/rest/services/public/Topo_Map/MapServer?f=pjson
    public getResource(resouceUrl: string): string {
        return new URI(resouceUrl)
            .removeSearch("f")
            .addSearch({ f: "pjson" })
            .toString();
    }

    // https://someportal/arcgis/home/item.html?id=ea532dd8876b4646aa2ab49533e458aa
    public getDatasetLandingPageUrl(id: string): string {
        return this.baseUrl
            .clone()
            .segment("home/item.html")
            .addQuery({ id: id })
            .toString();
    }
}
