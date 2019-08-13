/**
 * A tenant in the tenants table.
 */
export class Tenant {
    /**
     * The unique domain name of the tenant.
     */
    "domainname": string;
    /**
     * The unique ID of the tenant
     */
    "id": number;
    /**
     * The status of the tenant
     */
    "enabled": boolean;
}
