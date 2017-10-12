import {
    AspectDefinition,
    Record,
    WebHook,
    Operation
} from "../generated/registry/api";
import RegistryClient, { RegistryOptions } from "./RegistryClient";
import retry from "../retry";
import formatServiceError from "../formatServiceError";
import createServiceError from "../createServiceError";
import buildJwt from "../session/buildJwt";

export interface AuthorizedRegistryOptions extends RegistryOptions {
    jwtSecret: string;
    userId: string;
}

export default class AuthorizedRegistryClient extends RegistryClient {
    protected options: AuthorizedRegistryOptions;
    protected jwt: string;

    constructor(options: AuthorizedRegistryOptions) {
        super(options);

        this.options = options;
        this.jwt = buildJwt(options.jwtSecret, options.userId);
    }

    putAspectDefinition(
        aspectDefinition: AspectDefinition
    ): Promise<AspectDefinition | Error> {
        const operation = () =>
            this.aspectDefinitionsApi.putById(
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
            .then(result => result.body)
            .catch(createServiceError);
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
            .then(result => result.body)
            .catch(createServiceError);
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
            .then(result => result.body)
            .catch(createServiceError);
    }

    putRecord(record: Record): Promise<Record | Error> {
        const operation = () =>
            this.recordsApi.putById(
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
            .then(result => result.body)
            .catch(createServiceError);
    }

    putRecordAspect(
        recordId: string,
        aspectId: string,
        aspect: any
    ): Promise<Record | Error> {
        const operation = () =>
            this.recordAspectsApi.putById(
                encodeURIComponent(recordId),
                aspectId,
                aspect,
                this.jwt
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
            .then(result => result.body)
            .catch(createServiceError);
    }

    patchRecordAspect(
        recordId: string,
        aspectId: string,
        aspectPatch: Operation[]
    ): Promise<Record | Error> {
        const operation = () =>
            this.recordAspectsApi.patchById(
                encodeURIComponent(recordId),
                aspectId,
                aspectPatch,
                this.jwt
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
            .then(result => result.body)
            .catch(createServiceError);
    }
}
