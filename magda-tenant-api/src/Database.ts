import createPool from "./createPool.js";
import { Tenant } from "magda-typescript-common/src/tenant-api/Tenant.js";
import pg from "pg";
import _ from "lodash";
import { sqls } from "sql-syntax";

export interface DatabaseOptions {
    dbHost: string;
    dbPort: number;
}

export default class Database {
    private pool: pg.Pool;

    constructor(options: DatabaseOptions) {
        this.pool = createPool(options);
    }

    async getTenants(): Promise<Tenant[]> {
        const res = await this.pool.query(`SELECT * FROM tenants`);
        return res.rows;
    }

    async createTenant(tenant: Omit<Tenant, "id">): Promise<Tenant> {
        const result = await this.pool.query(
            ...sqls`INSERT INTO tenants(domainname, enabled) VALUES(${tenant.domainname}, ${tenant.enabled}) RETURNING domainname, id, enabled`.toQuery()
        );
        const theTenant: Tenant = result.rows[0];
        return theTenant;
    }
}
