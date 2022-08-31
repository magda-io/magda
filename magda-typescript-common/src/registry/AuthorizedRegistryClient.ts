import {
    AspectDefinition,
    Record,
    WebHook,
    Operation,
    WebHookAcknowledgementResponse,
    MultipleDeleteResult,
    EventsPage,
    DeleteResult
} from "../generated/registry/api";
import RegistryClient, {
    RegistryOptions,
    toServerError
} from "./RegistryClient";
import retry from "../retry";
import formatServiceError from "../formatServiceError";
import buildJwt from "../session/buildJwt";
import { IncomingMessage } from "http";
import { Maybe } from "tsmonad";
import ServerError from "../ServerError";

// when none of jwt, userId or jwtSecret is provided, the request is deemed to be issued by anonymous users
export interface AuthorizedRegistryOptions extends RegistryOptions {
    jwt?: string;
    userId?: string;
    jwtSecret?: string;
}

export default class AuthorizedRegistryClient extends RegistryClient {
    protected jwt: string = undefined;

    constructor(options: AuthorizedRegistryOptions) {
        super(options);

        if (options.tenantId === undefined || options.tenantId === null) {
            throw Error("A tenant id must be defined.");
        }

        if (options?.userId && !options.jwtSecret) {
            throw Error("jwtSecret must be supplied when userId is supplied.");
        }

        if (!options?.userId && options.jwtSecret) {
            throw Error("userId must be supplied when jwtSecret is supplied.");
        }

        if (options?.userId && options.jwtSecret) {
            this.jwt = buildJwt(options.jwtSecret, options.userId);
        } else if (options?.jwt) {
            this.jwt = options.jwt;
        }
    }

    async getAspectDefinition(aspectId: string): Promise<AspectDefinition> {
        return await super.getAspectDefinition(aspectId, this.jwt);
    }

    putAspectDefinition(
        aspectDefinition: AspectDefinition,
        tenantId: number = this.tenantId
    ): Promise<AspectDefinition | ServerError> {
        const operation = () =>
            this.aspectDefinitionsApi.putById(
                tenantId,
                encodeURIComponent(aspectDefinition.id),
                aspectDefinition,
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to create aspect definition "${aspectDefinition.id}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putAspectDefinition"));
    }

    postHook(hook: WebHook): Promise<WebHook | ServerError> {
        const operation = () => this.webHooksApi.create(hook, this.jwt);

        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT hook record.`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("postHook"));
    }

    putHook(hook: WebHook): Promise<WebHook | ServerError> {
        const operation = () =>
            this.webHooksApi.putById(
                encodeURIComponent(hook.id),
                hook,
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT hook record.`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putHook"));
    }

    getHook(hookId: string): Promise<Maybe<WebHook> | ServerError> {
        const operation = () =>
            this.webHooksApi
                .getById(encodeURIComponent(hookId), this.jwt)
                .then((result) => Maybe.just(result.body))
                .catch(
                    (e: { response?: IncomingMessage; message?: string }) => {
                        if (e.response && e.response.statusCode === 404) {
                            return Maybe.nothing();
                        } else {
                            throw new ServerError(
                                "Failed to get hook: " + e.message,
                                e?.response?.statusCode
                            );
                        }
                    }
                );
        return <any>(
            retry(
                operation,
                this.secondsBetweenRetries,
                this.maxRetries,
                (e, retriesLeft) =>
                    console.log(
                        formatServiceError(
                            `Failed to GET hook ${hookId}`,
                            e,
                            retriesLeft
                        )
                    )
            ).catch(toServerError("getHook"))
        );
    }

    getHooks(): Promise<WebHook[] | ServerError> {
        const operation = () => () => this.webHooksApi.getAll(this.jwt);
        return <any>retry(
            operation(),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError("Failed to GET hooks.", e, retriesLeft)
                )
        )
            .then((result) => result.body)
            .catch(toServerError("getHooks"));
    }

    resumeHook(
        webhookId: string,
        succeeded: boolean = false,
        lastEventIdReceived: string = null,
        active?: boolean
    ): Promise<WebHookAcknowledgementResponse | ServerError> {
        const operation = () =>
            this.webHooksApi.ack(
                encodeURIComponent(webhookId),
                { succeeded, lastEventIdReceived, active },
                this.jwt
            );

        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to resume webhook ${webhookId}`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("resumeHook"));
    }

    creatRecord(
        record: Record,
        tenantId: number = this.tenantId
    ): Promise<Record | ServerError> {
        const operation = () =>
            this.recordsApi.create(tenantId, record, this.jwt);
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to create registry record with ID "${record.id}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("createRecord"));
    }

    putRecord(
        record: Record,
        tenantId: number = this.tenantId
    ): Promise<Record | ServerError> {
        const operation = () =>
            this.recordsApi.putById(
                tenantId,
                encodeURIComponent(record.id),
                record,
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT data registry record with ID "${record.id}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putRecord"));
    }

    patchRecord(
        recordId: string,
        recordPatch: Operation[],
        tenantId: number = this.tenantId
    ): Promise<Record | ServerError> {
        const operation = () =>
            this.recordsApi.patchById(
                tenantId,
                encodeURIComponent(recordId),
                recordPatch,
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PATCH data registry record with ID "${recordId}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("patchRecord"));
    }

    patchRecords(
        recordIds: string[],
        recordPatch: Operation[],
        tenantId: number = this.tenantId
    ): Promise<string[] | ServerError> {
        const operation = () =>
            this.recordsApi.patchRecords(
                tenantId,
                { recordIds, jsonPath: recordPatch as any },
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PATCH registry records with ID "${recordIds.join(
                            ", "
                        )}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("patchRecords"));
    }

    putRecordAspect(
        recordId: string,
        aspectId: string,
        aspect: any,
        merge: boolean = false,
        tenantId: number = this.tenantId
    ): Promise<any | ServerError> {
        const operation = () =>
            this.recordAspectsApi.putById(
                encodeURIComponent(recordId),
                aspectId,
                aspect,
                this.jwt,
                tenantId,
                merge
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT data registry aspect ${aspectId} for record with ID "${recordId}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putRecordAspect"));
    }

    putRecordsAspect(
        recordIds: string[],
        aspectId: string,
        aspectData: any,
        merge: boolean = false,
        tenantId: number = this.tenantId
    ): Promise<string[] | ServerError> {
        const operation = () =>
            this.recordsApi.putRecordsAspect(
                tenantId,
                aspectId,
                { recordIds, data: aspectData },
                this.jwt,
                merge
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT aspect ${aspectId} for records with ID: "${recordIds.join(
                            ","
                        )}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putRecordsAspect"));
    }

    deleteRecordsAspectArrayItems(
        recordIds: string[],
        aspectId: string,
        jsonPath: string,
        items: (string | number)[],
        tenantId: number = this.tenantId
    ): Promise<string[] | ServerError> {
        const operation = () =>
            this.recordsApi.deleteRecordsAspectArrayItems(
                tenantId,
                aspectId,
                { recordIds, jsonPath, items },
                this.jwt
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to deleteRecordsAspectArrayItems at jsonPath "${jsonPath}" aspect ${aspectId} for records with ID: "${recordIds.join(
                            ","
                        )}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("deleteRecordsAspectArrayItems"));
    }

    deleteRecordAspect(
        recordId: string,
        aspectId: string,
        tenantId: number = this.tenantId
    ): Promise<DeleteResult | ServerError> {
        const operation = () =>
            this.recordAspectsApi.deleteById(
                encodeURIComponent(recordId),
                aspectId,
                this.jwt,
                tenantId
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT data registry aspect ${aspectId} for record with ID "${recordId}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("putRecordAspect"));
    }

    patchRecordAspect(
        recordId: string,
        aspectId: string,
        aspectPatch: Operation[],
        tenantId: number = this.tenantId
    ): Promise<Record | ServerError> {
        const operation = () =>
            this.recordAspectsApi.patchById(
                encodeURIComponent(recordId),
                aspectId,
                aspectPatch,
                this.jwt,
                tenantId
            );
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to PUT data registry aspect ${aspectId} for record with ID "${recordId}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("patchRecordAspect"));
    }

    deleteBySource(
        sourceTagToPreserve: string,
        sourceId: string,
        tenantId: number = this.tenantId
    ): Promise<MultipleDeleteResult | "Processing" | ServerError> {
        const operation = () =>
            this.recordsApi
                .trimBySourceTag(
                    tenantId,
                    sourceTagToPreserve,
                    sourceId,
                    this.jwt
                )
                .then((result) => {
                    if (result.response.statusCode === 202) {
                        return "Processing" as "Processing";
                    } else {
                        return result.body as MultipleDeleteResult;
                    }
                });

        return retry<MultipleDeleteResult | "Processing" | ServerError>(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to DELETE with sourceTagToPreserve ${sourceTagToPreserve} and sourceId ${sourceId}`,
                        e,
                        retriesLeft
                    )
                )
        ).catch(toServerError("deleteBySource"));
    }

    deleteRecord(
        id: string,
        tenantId: number = this.tenantId
    ): Promise<DeleteResult | ServerError> {
        const operation = () =>
            this.recordsApi.deleteById(tenantId, id, this.jwt);
        return retry(
            operation,
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError(
                        `Failed to DELETE registry record with ID "${id}".`,
                        e,
                        retriesLeft
                    )
                )
        )
            .then((result) => result.body)
            .catch(toServerError("deletetRecord"));
    }

    getRecordHistory(
        id: string,
        pageToken?: string,
        start?: number,
        limit?: number
    ): Promise<EventsPage | ServerError> {
        const operation = (id: string) => () =>
            this.recordHistoryApi.history(
                this.tenantId,
                encodeURIComponent(id),
                this.jwt,
                pageToken,
                start,
                limit
            );
        return <any>retry(
            operation(id),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError("Failed to GET history.", e, retriesLeft)
                ),
            (e) => {
                return !e.response || e.response.statusCode !== 404;
            }
        )
            .then((result) => result.body)
            .catch(toServerError("getRecordHistory"));
    }
}
