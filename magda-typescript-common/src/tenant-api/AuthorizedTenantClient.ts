require("isomorphic-fetch");
import { MAGDA_ADMIN_PORTAL_ID } from "../registry/TenantConsts";
import {Tenant} from "../tenant-api/Tenant"
import * as URI from "urijs";
import * as lodash from "lodash";
import retry from "../retry";
import formatServiceError from "../formatServiceError";
import createServiceError from "../createServiceError";
import buildJwt from "../session/buildJwt";

export interface TenantOptions {
    urlStr: string;
    maxRetries?: number;
    secondsBetweenRetries?: number;
    jwtSecret?: string;
    userId?: string;
}

export interface AuthorizedTenantOptions extends TenantOptions {
    jwtSecret: string;
    userId: string;
    tenantId: number;
}

export default class AuthorizedTenantClient {
    private jwt: string = null;
    private requestInitOption: RequestInit = null;
    
    protected uri: uri.URI;
    protected maxRetries: number;
    protected secondsBetweenRetries: number;
    protected defaultHeaders : any = {};

    constructor({
        urlStr,
        maxRetries = 10,
        secondsBetweenRetries = 10,
        jwtSecret = null,
        userId = null
    }: TenantOptions) {
        this.uri = new URI(urlStr);
        this.maxRetries = maxRetries;
        this.secondsBetweenRetries = secondsBetweenRetries;

        if (jwtSecret && userId) {
            this.jwt = buildJwt(jwtSecret, userId);
        }

        this.requestInitOption = {
            headers: {
                "X-Magda-Session": this.jwt,
                "Content-Type": "application/json",
                "X-Magda-Tenant-Id": `${MAGDA_ADMIN_PORTAL_ID}`
            }
        };
    }

    private getMergeRequestInitOption(extraOptions: RequestInit = null): RequestInit {
        return lodash.merge({}, this.requestInitOption, extraOptions);
    }

    private async get() {
        const res = await fetch(`${this.uri.valueOf()}`+ "tenants", 
        this.getMergeRequestInitOption({method: "GET"}))

        return <Promise<Tenant[]>>res.json();
    }

    getTenants(): Promise<Tenant[] | Error> {
        const operation = () => () =>
            this.get();

        return <any>retry(
            operation(),
            this.secondsBetweenRetries,
            this.maxRetries,
            (e, retriesLeft) =>
                console.log(
                    formatServiceError("Failed to GET tenants.", e, retriesLeft)
                )
        )
        .then(result => result)
        .catch(createServiceError);
    }
}
