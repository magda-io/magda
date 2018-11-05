// how to run
// docker run --network host postgres:9-alpine
// psql -h 127.0.0.1 -U postgres -c 'CREATE DATABASE auth;'
// PGHOST=localhost PGPORT=5432 PGDATABASE=auth PGUSER=postgres PGPASSWORD= yarn test

import * as db from "../../database/index";
import * as px from "../../database/postgres";
import * as ex from "../../database/express";

import { MockExpressServer } from "@magda/typescript-common/dist/test/connectors/MockExpressServer";

import * as pg from "pg";
import * as _ from "lodash";
import * as request from "supertest";

const TEST_OPTIONS = {
    dbHost: process.env.PGHOST,
    dbPort: parseInt(process.env.PGPORT),
    dbName: process.env.PGDATABASE,
    dbUser: process.env.PGUSER,
    dbPassword: process.env.PGPASSWORD,
    dbTable: "test",
    schema: {}
};

class MockServer extends MockExpressServer {
    database: any;
    constructor(database: db.Database) {
        super();
        this.database = database;
    }
    runImplementation(registry: any) {
        registry.use(
            "/api",
            ex.createAPI({
                prefix: "api",
                database: this.database
            })
        );
    }
}

// if all db test config items are set
if (
    _.entries(TEST_OPTIONS).filter(i => i[0].match(/^db/) && i[1] === undefined)
        .length === 0
) {
    [TEST_OPTIONS].forEach(OPTIONS => {
        describe(`DB TEST ${JSON.stringify(OPTIONS)}`, function() {
            let client: pg.Client;
            let servers: any[] = [];
            let server: any;
            let apiPort = 5000 + Math.round(Math.random() * 5000);
            // let apiPrefix = `http://localhost:${apiPort}/api`
            let database: db.Database;
            let agent: request.SuperTest<request.Test>;
            beforeEach(async function() {
                client = new pg.Client({
                    host: OPTIONS.dbHost,
                    port: OPTIONS.dbPort,
                    database: OPTIONS.dbName,
                    user: OPTIONS.dbUser
                });
                await client.connect();
                await client.query(STARTUP_SQL);
                servers.push(
                    await (server = new MockServer(
                        (database = px.create(OPTIONS))
                    )).run(apiPort)
                );
                await database.connect();
                agent = request.agent(server.app);
            });

            afterEach(async function() {
                await client.query(CLEANUP_SQL);
                await client.end();
                servers.forEach(server => server.server.close());
            });

            it("list", function(done) {
                agent
                    .get("/api/all?limit=1&sort=id")
                    .expect(200, {
                        hitCount: "2",
                        items: [
                            {
                                id: "1"
                            }
                        ],
                        limit: 1,
                        order: "asc",
                        sort: "id",
                        start: 0
                    })
                    .end(done);
            });
        });
    });
}

const STARTUP_SQL = `
CREATE TABLE IF NOT EXISTS test
(
    id character varying(200) NOT NULL,
    data text,
    -- history
    serial       bigserial,
    time         timestamptz NOT NULL DEFAULT NOW(),
    nextSerial   bigint DEFAULT -1,
    "user"       uuid NOT NULL,
    deleted      boolean NOT NULL DEFAULT FALSE,
    "comments"   text DEFAULT NULL
)
WITH (
    OIDS = FALSE
)
TABLESPACE pg_default;

-- full id index for history lookup
CREATE INDEX index_test_id ON test (id);

-- serial index for update lookup
CREATE INDEX index_test_serial ON test (serial);

-- partial id index to get latest state
CREATE INDEX index_test_id_latest ON test (id) WHERE nextSerial = -1 AND deleted = false;

INSERT INTO public.test
  (id, data, serial, nextSerial, deleted, "user")
VALUES
  ('1', '1-c', 1, 2, false, '00000000-0000-4000-8000-000000000000'),
  ('1', '1-d', 2, -1, false, '00000000-0000-4000-8000-000000000000'),
  ('2', '2-d', 3, -1, true, '00000000-0000-4000-8000-000000000000'),
  ('3', '3-d', 4, -1, false, '00000000-0000-4000-8000-000000000000');
`;

const CLEANUP_SQL = `
DROP TABLE test;
`;
