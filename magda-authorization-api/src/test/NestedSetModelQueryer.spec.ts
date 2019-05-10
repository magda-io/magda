import "mocha";
import * as pg from "pg";
import { expect } from "chai";
import NestedSetModelQueryer from "../NestedSetModelQueryer";

describe("Test NestedSetModelQueryer", function(this: Mocha.ISuiteCallbackContext) {
    this.timeout(10000);
    let pool: pg.Pool = null;
    const createTables: string[] = [];

    before(async function() {
        // --- you have to supply a db name to connect to pg
        pool = new pg.Pool({
            database: "postgres",
            user: "postgres"
        });
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
        pool = new pg.Pool({
            database: "test",
            user: "postgres"
        });
        await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
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

    async function createTestTable() {
        const tableName = `test_tbl_${Math.random()
            .toString()
            .replace(".", "")}`;
        await pool.query(`CREATE TABLE "${tableName}" (
            "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
            "name" varchar(250) NOT NULL DEFAULT ''::character varying,
            "left" int4 NOT NULL,
            "right" int4 NOT NULL,
            PRIMARY KEY ("id")
        ) WITH (
            OIDS = FALSE
        )`);
        createTables.push(tableName);
        return tableName;
    }

    /**
     * Create test data as followings:
     *
     *         +---------+
     *         |  Albert |
     *         | 1     12|
     *         +----+----+
     *             |
     *     +--------+--------+
     *     |                 |
     * +----+----+       +----+----+
     * |   Bert  |       |  Chuck  |
     * | 2     3 |       | 4     11|
     * +---------+       +----+----+
     *                     |
     *         +-------------------------+
     *         |            |            |
     *     +----+----+  +----+----+  +----+----+
     *     |  Donna  |  |  Eddie  |  |   Fred  |
     *     | 5     6 |  | 7     8 |  | 9     10|
     *     +---------+  +---------+  +---------+
     *
     * @returns
     */
    async function createTestTableWithTestData() {
        const tableName = await createTestTable();
        await pool.query(`INSERT INTO "${tableName}" ("name", "left", "right") VALUES
        ('Albert', 1, 12),
        ('Bert', 2, 3),
        ('Chuck', 4, 11),
        ('Donna', 5, 6),
        ('Eddie', 7, 8),
        ('Fred', 9, 10)`);
        return tableName;
    }

    async function getNodeIdFromName(tableName: string, name: string) {
        const queryer = new NestedSetModelQueryer(pool, tableName);
        const nodes = await queryer.getNodesByName(name);
        if (!nodes) throw new Error(`Can't find node by name: ${name}`);
        return nodes[0]["id"];
    }

    it("Test `getNodesByName`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        const nodes = await queryer.getNodesByName("Chuck");
        expect(nodes.length).to.equal(1);
        expect(nodes[0]["name"]).to.equal("Chuck");
    });

    it("Test `getRootNode`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        const node = await queryer.getRootNode();
        expect(node.name).to.equal("Albert");
    });

    it("Test `defaultSelectFieldList` paremeter", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName, [
            "id",
            "left"
        ]);
        const node = await queryer.getRootNode();
        expect(Object.keys(node)).to.have.members(["id", "left"]);
    });

    it("Test `getLeafNodes`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        const nodes = await queryer.getLeafNodes();
        expect(nodes.map(n => n.name)).to.have.members([
            "Bert",
            "Donna",
            "Eddie",
            "Fred"
        ]);
    });

    it("Test `getAllChildren`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let nodes = await queryer.getAllChildren(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(nodes.map(n => n.name)).to.have.members([
            "Bert",
            "Chuck",
            "Donna",
            "Eddie",
            "Fred"
        ]);

        nodes = await queryer.getAllChildren(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(nodes.map(n => n.name)).to.have.members([
            "Donna",
            "Eddie",
            "Fred"
        ]);

        nodes = await queryer.getAllChildren(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(nodes).be.null;
    });

    it("Test `getImmediateChildren`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let nodes = await queryer.getImmediateChildren(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Bert", "Chuck"]);

        nodes = await queryer.getImmediateChildren(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(nodes.map(n => n.name)).to.have.members([
            "Donna",
            "Eddie",
            "Fred"
        ]);

        nodes = await queryer.getImmediateChildren(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(nodes).be.null;
    });

    it("Test `getAllParents`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let nodes = await queryer.getAllParents(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Albert"]);

        nodes = await queryer.getAllParents(
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Chuck", "Albert"]);

        nodes = await queryer.getAllParents(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Albert"]);

        nodes = await queryer.getAllParents(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(nodes).be.null;
    });

    it("Test `getImmediateParent`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let node = await queryer.getImmediateParent(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(node.name).to.equal("Albert");

        node = await queryer.getImmediateParent(
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(node.name).to.equal("Chuck");

        node = await queryer.getImmediateParent(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(node.name).to.equal("Albert");

        node = await queryer.getImmediateParent(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(node).be.null;
    });
});
