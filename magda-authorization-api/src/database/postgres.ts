import * as db from "./index";

import * as pg from "pg";

export interface Options extends db.Options {
    dbHost: string;
    dbPort: number;
    dbName: string;
    dbTable: string;
    dbUser?: string;
    dbPassword?: string;
}

export class Database extends db.Database {
    protected connection: pg.Pool | pg.Client = null;

    constructor(options: Options) {
        super(options);
    }

    async connect() {
        const options = <Options>this.options;
        this.connection = new pg.Pool({
            database: options.dbName, //env var: PGDATABASE
            host: options.dbHost, // Server hosting the postgres database
            port: options.dbPort, //env var: PGPORT
            max: 10, // max number of clients in the pool
            idleTimeoutMillis: 30000, // how
            user: options.dbUser,
            password: options.dbPassword
        });
        await this.check();
    }

    async all(query?: db.Query): Promise<db.DocumentList> {
        const options = <Options>this.options;

        query = cleanQuery(query, options);

        const output: db.DocumentList = {
            hitCount: 0,
            items: [],
            ...query
        };
        let sql: string = "";
        let params: any[] = [];

        //sql += 'BEGIN;\n'

        sql += "SELECT ";
        sql += options.summaryFields.map(x => `"${x}"`).join(",");
        sql += ", COUNT(*) OVER() as hitcount ";
        sql += `\nFROM "${options.dbTable}" `;

        sql += `\nWHERE `;

        sql += ` nextSerial = -1 AND deleted = false `;

        params.push(output.sort);
        sql += `\nORDER BY \$${params.length}::text ${output.order} `;

        params.push(output.start);
        sql += `\nOFFSET \$${params.length}::numeric `;
        params.push(output.limit);
        sql += `\nLIMIT \$${params.length}::numeric `;

        sql += `;`;

        //sql += 'COMMIT;'
        // console.log(sql, params);
        const results = await this.connection.query(sql, params);

        for (let row of results.rows) {
            row = Object.assign({}, row);
            output.hitCount = row.hitcount;
            row.hitcount = undefined;
            output.items.push(row);
        }

        return output;
    }

    async create(document: db.Document): Promise<db.Document> {
        throw new Error("UNIMPLEMENTED create");
    }

    async read(document: db.Document): Promise<db.Document> {
        throw new Error("UNIMPLEMENTED read");
    }

    async update(document: db.Document): Promise<db.Document> {
        throw new Error("UNIMPLEMENTED update");
    }

    async delete(document: db.Document): Promise<void> {
        throw new Error("UNIMPLEMENTED delete");
    }

    async check(): Promise<any> {
        if (!this.connection) {
            await this.connect();
        }
        await this.connection.query(`SELECT NOW();`);
    }
}

// export class MemDatabase extends Database {}

export function create(options: Options) {
    // if (options.inMemory) {
    //     return new MemDatabase(options);
    // } else {
    return new Database(options);
    // }
}

function intQuery(
    value: number,
    min: number,
    max: number,
    default_: number
): number {
    value = parseInt(<any>value);
    if (Number.isNaN(value)) {
        value = default_;
    }
    value = Math.min(Math.max(min, value), max);
    return value;
}

function cleanQuery(query: db.Query, options: Options): db.Query {
    if (!query) {
        query = {};
    }

    if (!query.sort || options.summaryFields.indexOf(query.sort) === -1) {
        query.sort = "id";
    }
    query.order = query.order === "desc" ? "desc" : "asc";

    query.limit = intQuery(query.limit, 1, 1000, 100);
    query.start = intQuery(query.start, 0, Number.MAX_SAFE_INTEGER - 10, 0);
    // console.log(query);
    return query;
}
