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

export interface AuthorizedRegistryUserIdAndJwtSecretOptions
    extends RegistryOptions {
    userId: string;
    jwtSecret: string;
    jwt?: never;
}

export interface AuthorizedRegistryJwtOptions extends RegistryOptions {
    jwt: string;
    userId?: never;
    jwtSecret?: never;
}

export type AuthorizedRegistryOptions =
    | AuthorizedRegistryUserIdAndJwtSecretOptions
    | AuthorizedRegistryJwtOptions;

export default class AuthorizedRegistryClient extends RegistryClient {
    protected jwt: string;

    constructor(options: AuthorizedRegistryOptions) {
        if (options.tenantId === undefined || options.tenantId === null) {
            throw Error("A tenant id must be defined.");
        }

        if (!options.jwt) {
            if (!options.userId || !options.jwtSecret) {
                throw Error(
                    "Either jwt or userId and jwtSecret must have values."
                );
            }
        }

        super(options);
        this.jwt = options.jwt
            ? options.jwt
            : buildJwt(options.jwtSecret, options.userId);
    }

    async getAspectDefinition(aspectId: string): Promise<AspectDefinition> {
        return await super.getAspectDefinition(aspectId, this.jwt);
    }

    putAspectDefinition(
        aspectDefinition: AspectDefinition,
        tenantId: number = this.tenantId
    ): Promise<AspectDefinition | Error> {
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

    postHook(hook: WebHook): Promise<WebHook | Error> {
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

    putHook(hook: WebHook): Promise<WebHook | Error> {
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

    getHook(hookId: string): Promise<Maybe<WebHook> | Error> {
        const operation = () =>
            this.webHooksApi
                .getById(encodeURIComponent(hookId), this.jwt)
                .then((result) => Maybe.just(result.body))
                .catch(
                    (e: { response?: IncomingMessage; message?: string }) => {
                        if (e.response && e.response.statusCode === 404) {
                            return Maybe.nothing();
                        } else {
                            throw new Error(
                                "Failed to get hook, status was " +
                                    (e.response && e.response.statusCode) +
                                    "\n" +
                                    e.message
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

    getHooks(): Promise<WebHook[] | Error> {
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
    ): Promise<WebHookAcknowledgementResponse | Error> {
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

    putRecord(
        record: Record,
        tenantId: number = this.tenantId
    ): Promise<Record | Error> {
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

    putRecordAspect(
        recordId: string,
        aspectId: string,
        aspect: any,
        tenantId: number = this.tenantId
    ): Promise<Record | Error> {
        const operation = () =>
            this.recordAspectsApi.putById(
                encodeURIComponent(recordId),
                aspectId,
                aspect,
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

    deleteRecordAspect(
        recordId: string,
        aspectId: string,
        tenantId: number = this.tenantId
    ): Promise<DeleteResult | Error> {
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
    ): Promise<Record | Error> {
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
    ): Promise<MultipleDeleteResult | "Processing" | Error> {
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

        return retry<MultipleDeleteResult | "Processing" | Error>(
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

    getRecordHistory(
        id: string,
        pageToken?: string,
        start?: number,
        limit?: number
    ): Promise<EventsPage | Error> {
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
