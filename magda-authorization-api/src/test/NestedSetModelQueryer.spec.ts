import "mocha";
import * as pg from "pg";
import { expect } from "chai";
import NestedSetModelQueryer, { NodeRecord } from "../NestedSetModelQueryer";

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
     *              |
     *     +--------+--------+
     *     |                 |
     * +----+----+       +----+----+
     * |   Bert  |       |  Chuck  |
     * | 2     3 |       | 4     11|
     * +---------+       +----+----+
     *                        |
     *         +-------------------------+
     *         |             |            |
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

    it("Test `getAllNodesAtLevel`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let nodes = await queryer.getAllNodesAtLevel(1);
        expect(nodes.length).to.equal(1);
        expect(nodes[0].name).to.equal("Albert");

        nodes = await queryer.getAllNodesAtLevel(2);
        expect(nodes.map(n => n.name)).to.have.members(["Bert", "Chuck"]);

        nodes = await queryer.getAllNodesAtLevel(3);
        expect(nodes.map(n => n.name)).to.have.members([
            "Donna",
            "Eddie",
            "Fred"
        ]);

        nodes = await queryer.getAllNodesAtLevel(4);
        expect(nodes).be.null;
    });

    it("Test `getLevelOfNode`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let level: number;
        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(level).to.equal(1);

        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(level).to.equal(2);

        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(level).to.equal(2);

        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(level).to.equal(3);

        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Fred")
        );
        expect(level).to.equal(3);

        level = await queryer.getLevelOfNode(
            await getNodeIdFromName(tableName, "Eddie")
        );
        expect(level).to.equal(3);
    });

    it("Test `getTreeHeight`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let height = await queryer.getTreeHeight();
        expect(height).to.equal(3);
    });

    it("Test `getLeftMostImmediateChild`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let node: NodeRecord;
        node = await queryer.getLeftMostImmediateChild(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(node.name).to.equal("Bert");

        node = await queryer.getLeftMostImmediateChild(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(node).be.null;

        node = await queryer.getLeftMostImmediateChild(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(node.name).to.equal("Donna");

        node = await queryer.getLeftMostImmediateChild(
            await getNodeIdFromName(tableName, "Eddie")
        );
        expect(node).be.null;
    });

    it("Test `getRightMostImmediateChild`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let node: NodeRecord;
        node = await queryer.getRightMostImmediateChild(
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(node.name).to.equal("Chuck");

        node = await queryer.getRightMostImmediateChild(
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(node).be.null;

        node = await queryer.getRightMostImmediateChild(
            await getNodeIdFromName(tableName, "Chuck")
        );
        expect(node.name).to.equal("Fred");

        node = await queryer.getRightMostImmediateChild(
            await getNodeIdFromName(tableName, "Eddie")
        );
        expect(node).be.null;
    });

    it("Test `getTopDownPathBetween`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let nodes: NodeRecord[];
        nodes = await queryer.getTopDownPathBetween(
            await getNodeIdFromName(tableName, "Albert"),
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(nodes.map(n => n.name)).to.have.members([
            "Albert",
            "Chuck",
            "Donna"
        ]);

        nodes = await queryer.getTopDownPathBetween(
            await getNodeIdFromName(tableName, "Albert"),
            await getNodeIdFromName(tableName, "Eddie")
        );
        expect(nodes.map(n => n.name)).to.have.members([
            "Albert",
            "Chuck",
            "Eddie"
        ]);

        nodes = await queryer.getTopDownPathBetween(
            await getNodeIdFromName(tableName, "Chuck"),
            await getNodeIdFromName(tableName, "Fred")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Chuck", "Fred"]);

        nodes = await queryer.getTopDownPathBetween(
            await getNodeIdFromName(tableName, "Albert"),
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(nodes.map(n => n.name)).to.have.members(["Albert", "Bert"]);

        nodes = await queryer.getTopDownPathBetween(
            await getNodeIdFromName(tableName, "Bert"),
            await getNodeIdFromName(tableName, "Fred")
        );
        // --- there is no path between Bert and Fred
        expect(nodes).be.null;
    });

    it("Test `compareNodes`", async () => {
        const tableName = await createTestTableWithTestData();
        const queryer = new NestedSetModelQueryer(pool, tableName);
        let compareResult: number;
        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Albert"),
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(compareResult).to.equal(1);

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Bert"),
            await getNodeIdFromName(tableName, "Albert")
        );
        expect(compareResult).to.equal(-1);

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Bert"),
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(compareResult).to.equal(0);

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Bert"),
            await getNodeIdFromName(tableName, "Eddie")
        );
        // --- as there is no path between Bert & Eddie
        // --- i.e. Eddie is not Bert's subordinate
        expect(compareResult).be.null;

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Eddie"),
            await getNodeIdFromName(tableName, "Bert")
        );
        expect(compareResult).be.null;

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Chuck"),
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(compareResult).to.equal(1);

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Chuck"),
            await getNodeIdFromName(tableName, "Donna")
        );
        expect(compareResult).to.equal(1);

        compareResult = await queryer.compareNodes(
            await getNodeIdFromName(tableName, "Chuck"),
            "60194a60-aaaa-aaaa-aaaa-3e4d3c2cfefc" //--- non exists node
        );
        expect(compareResult).be.null;
    });
});
