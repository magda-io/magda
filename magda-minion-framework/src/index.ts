import * as express from "express";
import Registry from "@magda/typescript-common/dist/registry/AuthorizedRegistryClient";
import MinionOptions from "./MinionOptions";
import setupWebhookEndpoint from "./setupWebhookEndpoint";
import setupRecrawlEndpoint from "./setupRecrawlEndpoint";
import startApiEndpoints from "./startApiEndpoints";
import isWebhookRegistered from "./isWebhookRegistered";
import registerWebhook from "./registerWebhook";
import resumeWebhook from "./resumeWebhook";
import Crawler from "./Crawler";
import { Tenant } from "@magda/typescript-common/dist/tenant-api/Tenant";
import AuthorizedTenantClient  from "@magda/typescript-common/dist/tenant-api/AuthorizedTenantClient";
import {
    MAGDA_ADMIN_PORTAL_ID,
    MAGDA_SYSTEM_ID
} from "@magda/typescript-common/dist/registry/TenantConsts";

export default async function minion(options: MinionOptions): Promise<void> {
    checkOptions(options);
    const registry = new Registry({
        baseUrl: options.argv.registryUrl,
        jwtSecret: options.argv.jwtSecret,
        userId: options.argv.userId,
        maxRetries: options.maxRetries,
        tenantId: options.tenantId
    });

    const tenantClient =  new AuthorizedTenantClient({
        urlStr: options.argv.tenantUrl,
        maxRetries: 1,
        secondsBetweenRetries: 1,
        jwtSecret: options.argv.jwtSecret,
        userId: options.argv.userId
    });

    const tenantIds: number[] = await tenantClient
        .getTenants()
        .then((tenants: Tenant[]) => {
            return tenants.map(t => t.id);
        });
    const crawler = new Crawler(registry, options);

    options.express = options.express || (() => express());

    const server = options.express();

    server.use(require("body-parser").json({ limit: "50mb" }));

    server.get("/healthz", (request, response) => {
        response.status(200).send("OK");
    });

    setupWebhookEndpoint(server, options, registry);
    setupRecrawlEndpoint(server, options, crawler);
    startApiEndpoints(server, options);

    await putAspectDefs();

    const webhookRegistered = await isWebhookRegistered(options, registry);

    if (webhookRegistered) {
        console.info("Webhook is already registered");
        await resumeWebhook(options, registry);
    } else {
        console.info("No webhook was registered");
        await registerWebhook(options, registry);

        await crawler.start();
    }

    function checkOptions(options: MinionOptions) {
        if (options.argv.listenPort <= 0 || options.argv.listenPort > 65535) {
            throw new Error(
                `Default port of ${options.argv.listenPort} is invalid`
            );
        }

        if (options.id === "") {
            throw new Error(`id is unspecified`);
        }

        if (options.argv.internalUrl === "") {
            throw new Error(`Internal url is unspecified`);
        }

        if (options.argv.registryUrl === "") {
            throw new Error(`Registry url is unspecified`);
        }

        if (options.argv.jwtSecret === "") {
            throw new Error(`JWT secret is unspecified`);
        }

        if (options.argv.userId === "") {
            throw new Error(`User id is unspecified`);
        }

        if (options.argv.tenantId === undefined) {
            throw new Error(`Tenant id is unspecified`);
        }

        const containsBlank = (strings: string[]) =>
            strings.some(string => string === "");

        if (containsBlank(options.aspects)) {
            throw new Error(
                `Aspects ${options.aspects} contains a blank aspect`
            );
        }

        if (containsBlank(options.optionalAspects)) {
            throw new Error(
                `Aspects ${options.optionalAspects} contains a blank aspect`
            );
        }
    }

    // TODO: How to deal with new tenants that are not in the tenantIds?
    async function putAspectDefs() {
        const aspectDefsToAdd = options.writeAspectDefs;
        console.info(
            `Adding aspect defs ${aspectDefsToAdd.map(def => def.name)}`
        );

        const addPromises = aspectDefsToAdd.map(aspectDef => {
            if (options.tenantId === MAGDA_SYSTEM_ID && tenantIds.length > 1) {
                tenantIds.map(id =>
                    registry.putAspectDefinition(aspectDef, id)
                );
            } else {
                registry.putAspectDefinition(aspectDef, MAGDA_ADMIN_PORTAL_ID);
            }
        });

        return Promise.all(addPromises)
            .then(failIfErrors)
            .then(result => {
                console.info("Successfully added aspect defs");
                return result;
            });
    }

    function failIfErrors<T>(results: Array<T | Error>) {
        const failed = results.filter(
            (result: T | Error) => result instanceof Error
        );

        if (failed.length > 0) {
            throw failed[0];
        } else {
            return results;
        }
    }
}
