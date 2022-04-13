import {
    AspectDefinition,
    AspectDefinitionsApi,
    Record,
    RecordsApi,
    RecordAspectsApi,
    WebHooksApi,
    RecordHistoryApi
} from "../generated/registry/api";
import URI from "urijs";
import retry from "../retry";
import formatServiceError from "../formatServiceError";
import { Response } from "request";
import ServerError from "../ServerError";

export interface RegistryOptions {
    baseUrl: string;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    tenantId: number;
}

export interface PutResult {
    successfulPuts: number;
    errors: Error[];
}

export interface RecordsPage<I extends Record> {
    totalCount: number;
    hasMore: boolean;
    nextPageToken?: string;
    records: I[];
}

export const toServerError = (apiName: string) => (
    error:
        | {
              body: any;
              response: Response;
          }
        | any
) => {
    if (error?.response?.statusCode) {
        const detailedErrorMsg = error?.body
            ? JSON.stringify(error.body)
            : error?.response?.responseText
            ? error.response.responseText
            : "";
        return new ServerError(
            `Failed to ${apiName}${
                detailedErrorMsg ? `: ${detailedErrorMsg}` : ""
            }`,
            error.response.statusCode
        );
    } else {
        return new ServerError(`Failed to ${apiName}: ${error}`, 500);
    }
};

export default class RegistryClient {
    protected baseUri: URI;
    protected aspectDefinitionsApi: AspectDefinitionsApi;
    protected recordsApi: RecordsApi;
    protected webHooksApi: WebHooksApi;
    protected recordAspectsApi: RecordAspectsApi;
    protected recordHistoryApi: RecordHistoryApi;
    protected maxRetries: number;
    protected secondsBetweenRetries: number;
    protected tenantId: number;
    protected jwt: string | undefined;

    constructor({
        baseUrl,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        tenantId
    }: RegistryOptions) {
        if (tenantId === undefined) {
            throw Error("A tenant id must be defined.");
        }

        this.tenantId = tenantId;
        const registryApiUrl = baseUrl;
        this.baseUri = new URI(baseUrl);
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;

        this.aspectDefinitionsApi = new AspectDefinitionsApi(registryApiUrl);
        this.recordsApi = new RecordsApi(registryApiUrl);
        this.recordsApi.useQuerystring = true; // Use querystring instead of qs to construct URL
        this.recordAspectsApi = new RecordAspectsApi(registryApiUrl);
        this.webHooksApi = new WebHooksApi(registryApiUrl);
        this.recordHistoryApi = new RecordHistoryApi(registryApiUrl);
    }

    getRecordUrl(id: string): string {
        return this.baseUri.clone().segment("records").segment(id).toString();
    }

    getAspectDefinitions(): Promise<AspectDefinition[] | Error> {
        const operation = () => () =>
            this.aspectDefinitionsApi.getAll(this.tenantId);
        return <any>retry(
            operation(),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        "Failed to GET aspect definitions.",
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("getAspectDefinitions"));
    }

    async getAspectDefinition(
        aspectId: string,
        jwtToken?: string
    ): Promise<AspectDefinition> {
        try {
            const res = await this.aspectDefinitionsApi.getById(
                this.tenantId,
                aspectId,
                jwtToken
            );
            if (typeof res.body === "string") {
                throw new Error("Invalid non-json response: " + res.body);
            }
            return res.body;
        } catch (e) {
            throw toServerError("getAspectDefinition")(e);
        }
    }

    getRecord(
        id: string,
        aspect?: Array<string>,
        optionalAspect?: Array<string>,
        dereference?: boolean
    ): Promise<Record | Error> {
        const operation = (id: string) => () =>
            this.recordsApi.getById(
                encodeURIComponent(id),
                this.tenantId,
                aspect,
                optionalAspect,
                dereference,
                this.jwt
            );
        return <any>retry(
            operation(id),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError("Failed to GET records.", e, retriesLeft)
                ),
            (e) => {
                return e?.response?.statusCode !== 404;
            }
        )
            .then((result) => result.body)
            .catch(toServerError("getRecord"));
    }

    async getRecordInFull(id: string): Promise<Record> {
        try {
            const res = await this.recordsApi.getByIdInFull(
                encodeURIComponent(id),
                this.tenantId,
                this.jwt
            );
            if (typeof res.body === "string") {
                throw new Error("Invalid non-json response: " + res.body);
            }
            return res.body;
        } catch (e) {
            throw toServerError("getRecordInFull")(e);
        }
    }

    getRecords<I extends Record>(
        aspect?: Array<string>,
        optionalAspect?: Array<string>,
        pageToken?: string,
        dereference?: boolean,
        limit?: number,
        aspectQueries?: string[],
        aspectOrQuery?: string[],
        orderBy?: string,
        orderByDir?: string,
        orderNullFirst?: boolean
    ): Promise<RecordsPage<I> | Error> {
        const operation = (pageToken: string) => () =>
            this.recordsApi.getAll(
                this.tenantId,
                aspect,
                optionalAspect,
                pageToken,
                undefined,
                limit,
                dereference,
                aspectQueries,
                aspectOrQuery,
                orderBy,
                orderByDir,
                orderNullFirst,
                this.jwt
            );
        return <any>retry(
            operation(pageToken),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError("Failed to GET records.", e, retriesLeft)
                )
        )
            .then((result) => result.body)
            .catch(toServerError("getRecords"));
    }

    getRecordsPageTokens(
        aspect?: Array<string>,
        limit?: number
    ): Promise<string[] | Error> {
        const operation = () =>
            this.recordsApi.getPageTokens(
                this.tenantId,
                aspect,
                limit,
                this.jwt
            );
        return <any>retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        "Failed to GET records page tokens.",
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("getRecordsPageTokens"));
    }
}
