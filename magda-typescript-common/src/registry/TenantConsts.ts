/**
 * These constants are the same as defined in the scala model Registry.
 *
 * MAGDA_ADMIN_PORTAL_ID and MAGDA_SYSTEM_ID play different roles.
 *
 * 1. Role of MAGDA_ADMIN_PORTAL_ID in single tenant mode
 * Tenant IDs are foreign keys in many tables. When migrating the existing DB, all existing entries in table aspects,
 * records, recordaspects and events must have non-null values in field of tenantId. They are all set to
 * MAGDA_ADMIN_PORTAL_ID. MAGDA_ADMIN_PORTAL_ID is the tenant id in single tenant deployment (default deployment).
 *
 * 2. Role of MAGDA_ADMIN_PORTAL_ID in multi-tenant mode
 * It manages tenants only. It creates, enables or disable tenants.
 *
 * 3. Role of MAGDA_SYSTEM_ID
 * It is not important in single tenant mode but necessary in multi-tenant mode. It is mainly used to perform global
 * operations. For example, when re-indexing datasets, it will retrieve records and record aspects of all tenants from
 * DB. Many minions also take this role, e.g. a broken link minion.
 *
 * TODO: Investigate how to use swagger codegen to automatically generate these constants.
 */
export const MAGDA_ADMIN_PORTAL_ID = 0;

/**
 * Request with this tenant ID can perform global operations on registry.
 *
 * @see {module:magda-typescript-commone.registry.TenantConsts.MAGDA_ADMIN_PORTAL_ID}
 */
export const MAGDA_SYSTEM_ID = -1;

/**
 * The header name of tenant ID.
 */
export const MAGDA_TENANT_ID_HEADER = "X-Magda-Tenant-Id";
