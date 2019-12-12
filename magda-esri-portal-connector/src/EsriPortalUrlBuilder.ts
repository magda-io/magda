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
    public token: string;

    constructor(options: EsriPortalUrlBuilderOptions) {
        this.id = options.id;
        this.name = options.name || options.id;
        this.baseUrl = new URI(options.baseUrl);
        this.apiBaseUrl = this.baseUrl.clone().segment("sharing/rest");
        this.token = null;
    }

    // https://someportal/arcgis/sharing/rest/generateToken
    public getTokenUrl(): string {
        return this.apiBaseUrl
            .clone()
            .segment("generateToken")
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/community/groups?q=orgid:0123456789ABCDEF -owner:esri_nav -owner:esri_livingatlas -owner:esri_boundaries -owner:esri_demographics&f=json&token=
    public getPortalGroups(): string {
        return this.apiBaseUrl
            .clone()
            .segment("community/groups")
            .addSearch({
                f: "json",
                num: 100,
                q: "orgid:0123456789ABCDEF", // TODO: don't hard-code org ID
                token: this.token
            })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/search?f=pjson&q=1
    public getDataSearchUrl(): string {
        const types = [
            "Map Service",
            "Feature Service",
            "Web Mapping Application",
            "CAD Drawing",
            "WMS",
            "WFS",
            "Web Map",
            //"Service Definition",
            "CityEngine Web Scene",
            "Shapefile",
            "Scene Service",
            "File Geodatabase",
            //"Code Sample",
            //"PDF",
            //"Site Application",
            //"Image",
            //"Image Collection",
            //"Map Template",
            //"Microsoft Excel",
            //"Mobile Application",
            "Vector Tile Package",
            //"Mobile Map Package",
            //"Layer Template",
            //"Style",
            //"Content Category Set",
            //"Desktop Application",
            "Vector Tile Service",
            "Web Scene",
            "CSV",
            "Scene Package",
            //"Document Link",
            "WMTS",
            "KML",
            //"Symbol Set",
            "GeoJson",
            //"Feature Collection Template",
            "Image Service"
        ];

        return this.apiBaseUrl
            .clone()
            .segment("search")
            .addSearch({
                f: "json",
                q: types.map(type => 'type:"' + type + '"').join(" OR "),
                num: 100,
                token: this.token
            })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/portals/self?f=pjson
    public getOrganizationShowUrl(): string {
        return this.apiBaseUrl
            .clone()
            .segment("portals/self")
            .addSearch({
                f: "json",
                token: this.token
            })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/content/items/ea532dd8876b4646aa2ab49533e458aa?f=pjson
    public getContentItemUrl(id: string): string {
        return this.apiBaseUrl
            .clone()
            .segment("content/items")
            .segment(id)
            .addSearch({
                f: "json",
                token: this.token
            })
            .toString();
    }

    // https://someportal/arcgis/sharing/rest/content/items/ea532dd8876b4646aa2ab49533e458aa/groups?f=pjson
    public getContentItemGroups(id: string): string {
        return this.apiBaseUrl
            .clone()
            .segment("content/items")
            .segment(id)
            .segment("groups")
            .addSearch({
                f: "json",
                token: this.token
            })
            .toString();
    }

    // https://someserver/arcgis/rest/services/public/Topo_Map/MapServer?f=pjson
    // https://someserver/arcgis/rest/services/public/Topo_Map/MapServer/0?f=pjson
    public getResource(resouceUrl: string): string {
        return new URI(resouceUrl)
            .removeSearch("f")
            .addSearch({
                f: "pjson"
            })
            .toString();
    }

    // https://someportal/arcgis/home/item.html?id=ea532dd8876b4646aa2ab49533e458aa
    public getDatasetLandingPageUrl(id: string): string {
        return this.baseUrl
            .clone()
            .segment("home/item.html")
            .addQuery({
                id: id
            })
            .toString();
    }

    // https://someportal/arcgis/home/group.html?id=ea532dd8876b4646aa2ab49533e458aa
    public getGroupLandingPageUrl(id: string): string {
        return this.baseUrl
            .clone()
            .segment("home/group.html")
            .addQuery({ id: id })
            .toString();
    }
}
