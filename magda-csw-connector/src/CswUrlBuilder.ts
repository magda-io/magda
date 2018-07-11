import * as URI from "urijs";

export interface CswUrlBuilderOptions {
    id: string;
    name?: string;
    baseUrl: string;
    apiBaseUrl?: string;
}

export default class CswUrlBuilder {
    public readonly id: string;
    public readonly name: string;
    public readonly baseUrl: uri.URI;

    public readonly GetRecordsParameters = {
        service: "CSW",
        version: "2.0.2",
        request: "GetRecords",
        constraintLanguage: "FILTER",
        constraint_language_version: "1.1.0",
        resultType: "results",
        elementsetname: "full",
        outputschema: "http://www.isotc211.org/2005/gmd",
        typeNames: "gmd:MD_Metadata"
    };

    public readonly GetRecordByIdParameters = {
        service: "CSW",
        version: "2.0.2",
        request: "GetRecordById",
        elementsetname: "full",
        outputschema: "http://www.isotc211.org/2005/gmd",
        typeNames: "gmd:MD_Metadata"
    };

    constructor(options: CswUrlBuilderOptions) {
        this.id = options.id;
        this.name = options.name || options.id;
        this.baseUrl = new URI(options.baseUrl);
    }

    public getRecordsUrl(constraint?: string): string {
        const url = this.baseUrl.clone().addSearch(this.GetRecordsParameters);
        if (constraint) {
            url.addSearch("constraint", constraint);
        }
        return url.toString();
    }

    public getRecordByIdUrl(id: string): string {
        return this.baseUrl
            .clone()
            .addSearch(this.GetRecordByIdParameters)
            .addSearch("id", id)
            .toString();
    }
}
