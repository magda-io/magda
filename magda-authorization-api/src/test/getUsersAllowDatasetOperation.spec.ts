import "mocha";
import * as pg from "pg";
import * as _ from "lodash";
import * as chai from "chai";
import * as chaiAsPromised from "chai-as-promised";
//import getWhoAllowDatasetOperation from "../getWhoAllowDatasetOperation";
import getTestDBConfig from "./getTestDBConfig";
import runMigrationSql from "./runMigrationSql";

chai.use(chaiAsPromised);
//const { expect } = chai;

describe("Test NestedSetModelQueryer", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let pool: pg.Pool = null;
    const createTables: string[] = [];
    const dbConfig = getTestDBConfig();

    before(async function() {
        // --- you have to supply a db name to connect to pg
        pool = new pg.Pool({ ...dbConfig });
        try {
            await pool.query("CREATE database test");
        } catch (e) {
            // --- if database `test` already there
            // --- then mute the error
            if (e.code !== "42P04") {
                throw e;
            }
        }
        // --- end the current one & create a new one
        await pool.end();
        pool = new pg.Pool({ ...dbConfig, database: "test" });
    });

    after(async function() {
        if (pool) {
            for (let i = 0; i < createTables.length; i++) {
                await pool.query(`DROP TABLE IF EXISTS "${createTables[i]}"`);
            }
            pool.end();
            pool = null;
        }
    });

    it("test should xxxx", async () => {
        await runMigrationSql(pool, true);
        console.log("sss");
    });
});
