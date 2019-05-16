import * as pg from "pg";
import * as _ from "lodash";

export interface NodeRecord {
    [key: string]: any;
}

function isNonEmptyArray(v: any): boolean {
    if (!v || !_.isArray(v) || !v.length) return false;
    return true;
}

class NestedSetModelQueryer {
    private pool: pg.Pool;
    private tableName: string;

    /**
     * default select fields if [], all fields (i.e. `SELECT "id", "name"`) will be returned
     *
     * @type {string[]}
     * @memberof NestedSetModelQueryer
     */
    public defaultSelectFieldList: string[] = ["id", "name"];

    /**
     * Default field list that will be used when insert nodes into tree.
     * By default, only `name` field will be saved to database
     * e.g. If your tree nodes have three properties (besides `id`, `left`, `right` --- they auto generated):
     * - name
     * - description
     * - fullName
     *
     * Then you should set `defaultInsertFieldList` to ["name", "description", "fullName"]
     *
     * @type {string[]}
     * @memberof NestedSetModelQueryer
     */
    public defaultInsertFieldList: string[] = ["name"];

    /**
     * Creates an instance of NestedSetModelQueryer.
     * @param {pg.Pool} dbPool
     * @param {string} tableName
     * @param {string[]} [defaultSelectFieldList=null] default select fields; If null, all fields (i.e. `SELECT "id", "name"`) will be returned
     * @memberof NestedSetModelQueryer
     */
    constructor(
        dbPool: pg.Pool,
        tableName: string,
        defaultSelectFieldList: string[] = null,
        defaultInsertFieldList: string[] = null
    ) {
        if (!dbPool) throw new Error("dbPool cannot be empty!");
        if (!tableName) throw new Error("tableName cannot be empty!");

        this.pool = dbPool;
        this.tableName = tableName;

        if (defaultSelectFieldList) {
            if (!_.isArray(defaultSelectFieldList))
                throw new Error("defaultSelectFieldList should be an array");

            this.defaultSelectFieldList = defaultSelectFieldList;
        }

        if (defaultSelectFieldList) {
            if (!_.isArray(defaultSelectFieldList))
                throw new Error("defaultSelectFieldList should be an array");

            this.defaultSelectFieldList = defaultSelectFieldList;
        }

        if (defaultInsertFieldList) {
            if (!_.isArray(defaultInsertFieldList))
                throw new Error("defaultInsertFieldList should be an array");

            this.defaultInsertFieldList = defaultInsertFieldList;
        }
    }

    private selectFields(tableAliasOrName: string = "") {
        if (
            !this.defaultSelectFieldList ||
            !_.isArray(this.defaultSelectFieldList) ||
            !this.defaultSelectFieldList.length
        ) {
            return "*";
        }
        // --- do not double quote `tableAliasOrName`
        // --- or you will get missing FROM-clause entry for table error
        return this.defaultSelectFieldList
            .map(f =>
                tableAliasOrName == "" ? `"${f}"` : `${tableAliasOrName}."${f}"`
            )
            .join(", ");
    }

    /**
     * Get nodes by name
     * You hardly need this one --- only for write test case (you can get a id from name)
     *
     * @param {string} name
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getNodesByName(name: string): Promise<NodeRecord[]> {
        const result = await this.pool.query(
            `SELECT ${this.selectFields()} FROM "${
                this.tableName
            }" WHERE "name" = $1`,
            [name]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get a node by its id
     *
     * @param {string} id
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getNodeById(id: string): Promise<NodeRecord> {
        const result = await this.pool.query(
            `SELECT ${this.selectFields()} FROM "${
                this.tableName
            }" WHERE "id" = $1`,
            [id]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0];
    }

    /**
     * Get the root node of the tree
     * Return null if empty tree
     *
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getRootNode(): Promise<NodeRecord> {
        const result = await this.pool.query(
            `SELECT ${this.selectFields()} FROM "${
                this.tableName
            }" WHERE "left" = 1`
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0];
    }

    /**
     * Leaf Nodes are the nodes that has no children under it
     *
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getLeafNodes(): Promise<NodeRecord[]> {
        const result = await this.pool.query(
            `SELECT ${this.selectFields()} FROM "${
                this.tableName
            }" WHERE "left" = ( "right" - 1 )`
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get All children of a given node
     * (including immediate children and children of immediate children etc.)
     * If the node has no child (i.e. a leaf node), null will be returned
     *
     * @param {string} parentNodeId
     * @param {boolean} [includeMyself=false]
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getAllChildren(
        parentNodeId: string,
        includeMyself: boolean = false
    ): Promise<NodeRecord[]> {
        const tbl = this.tableName;

        const result = await this.pool.query(
            `SELECT ${this.selectFields("Children")} 
             FROM "${tbl}" AS Parents,  "${tbl}" AS Children
             WHERE Children."left" ${
                 includeMyself ? ">=" : ">"
             } Parents."left" AND Children."left" ${
                includeMyself ? "<=" : "<"
            } Parents."right" AND Parents."id" = $1`,
            [parentNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get All parents of a given node
     * (including immediate parent and parents of immediate parent etc.)
     * If the node has no parent (i.e. a root node), null will be returned (unless `includeMyself` = true)
     *
     * @param {string} childNodeId
     * @param {boolean} [includeMyself=false]
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getAllParents(
        childNodeId: string,
        includeMyself: boolean = false
    ): Promise<NodeRecord[]> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("Parents")} 
             FROM "${tbl}" AS Parents,  "${tbl}" AS Children
             WHERE Children."left" ${
                 includeMyself ? ">=" : ">"
             } Parents."left" AND Children."left" ${
                includeMyself ? "<=" : "<"
            } Parents."right" AND Children."id" = $1`,
            [childNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get Immediate Children of a Node
     * If the node has no child (i.e. a leaf node), null will be returned
     *
     * @param {string} parentNodeId
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getImmediateChildren(parentNodeId: string): Promise<NodeRecord[]> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("Children")} 
            FROM "${tbl}" AS Parents, "${tbl}" AS Children
            WHERE Children.left BETWEEN Parents.left AND Parents.right 
            AND Parents.left = (
                SELECT MAX(S.left) FROM "${tbl}" AS S
                WHERE S.left < Children.left AND S.right > Children.right
            ) 
            AND Parents.id = $1`,
            [parentNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get Immediate Parent of a Node
     * If the node has no parent (i.e. a root node), null will be returned
     *
     * @param {string} childNodeId
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getImmediateParent(childNodeId: string): Promise<NodeRecord> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("Parents")} 
            FROM "${tbl}" AS Parents, "${tbl}" AS Children
            WHERE Children.left BETWEEN Parents.left AND Parents.right 
            AND Parents.left = (
                SELECT MAX(S.left) FROM "${tbl}" AS S
                WHERE S.left < Children.left AND S.right > Children.right
            ) 
            AND Children.id = $1`,
            [childNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0];
    }

    /**
     * Get all nodes at level n from top
     * e.g. get all nodes at level 3:
     * this.getAllNodesAtLevel(3)
     * Root node is at level 1
     *
     * @param {number} level
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getAllNodesAtLevel(level: number): Promise<NodeRecord[]> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("t2")}
            FROM "${tbl}" AS t1, "${tbl}" AS t2
            WHERE t2.left BETWEEN t1.left AND t1.right 
            GROUP BY t2.id 
            HAVING COUNT(t1.id) = $1`,
            [level]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Get level no. of a given node
     * Starts from 1. i.e. The root node is 1
     * If the node can't be found in the tree, return null
     *
     * @param {string} nodeId
     * @returns {Promise<number>}
     * @memberof NestedSetModelQueryer
     */
    async getLevelOfNode(nodeId: string): Promise<number> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT COUNT(Parents.id) AS level 
            FROM "${tbl}" AS Parents, "${tbl}" AS Children
            WHERE Children.left BETWEEN Parents.left AND Parents.right AND Children.id = $1`,
            [nodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        const level: number = parseInt(result.rows[0]["level"]);
        if (!_.isNumber(level) || _.isNaN(level) || level < 1) return null;
        return level;
    }

    /**
     * Get total height (no. of the levels) of the tree
     * Starts with 1 level
     * If no tree found, return null
     *
     * @returns {Promise<number>}
     * @memberof NestedSetModelQueryer
     */
    async getTreeHeight(): Promise<number> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT MAX(level) AS height 
             FROM(
                SELECT COUNT(t1.id)
                FROM "${tbl}" AS t1, "${tbl}" AS t2
                WHERE t2.left BETWEEN t1.left AND t1.right 
                GROUP BY t2.id 
             ) AS L(level)`
        );
        if (!result || !result.rows || !result.rows.length) return 0;
        const height: number = parseInt(result.rows[0]["height"]);
        if (!_.isNumber(height) || _.isNaN(height) || height < 0) return 0;
        return height;
    }

    /**
     * Get left most immediate child of a node
     *
     * @param {string} parentNodeId
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getLeftMostImmediateChild(parentNodeId: string): Promise<NodeRecord> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("Children")}
            FROM "${tbl}" AS Parents, "${tbl}" AS Children 
            WHERE Children.left = Parents.left + 1 AND Parents.id = $1`,
            [parentNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0];
    }

    /**
     * Get right most immediate child of a node
     *
     * @param {string} parentNodeId
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getRightMostImmediateChild(
        parentNodeId: string
    ): Promise<NodeRecord> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("Children")}
            FROM "${tbl}" AS Parents, "${tbl}" AS Children 
            WHERE Children.right = Parents.right - 1 AND Parents.id = $1`,
            [parentNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0];
    }

    /**
     * Get all nodes on the top to down path between the `higherNode` to the `lowerNode`
     * Sort from higher level nodes to lower level node
     * If a path doesn't exist, null will be returned
     * If you pass a lower node to the `higherNodeId` and a higher node to `lowerNodeId`, null will be returned
     *
     * @param {string} higherNodeId
     * @param {string} lowerNodeId
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getTopDownPathBetween(
        higherNodeId: string,
        lowerNodeId: string
    ): Promise<NodeRecord[]> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT ${this.selectFields("t2")}
            FROM "${tbl}" AS t1, "${tbl}" AS t2, "${tbl}" AS t3 
            WHERE t1.id = $1 AND t3.id = $2
            AND t2.left BETWEEN t1.left AND t1.right 
            AND t3.left BETWEEN t2.left AND t2.right
            ORDER BY (t2.right-t2.left) DESC`,
            [higherNodeId, lowerNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    /**
     * Compare the relative position of the two nodes
     * If node1 is superior to node2, return 1
     * if node1 is the subordinate of node2, return -1
     * If node1 = node2 return 0
     * If there is no path can be found between Node1 and Node2 return null
     *
     * @param {string} node1Id
     * @param {string} node2Id
     * @returns {Promise<number>}
     * @memberof NestedSetModelQueryer
     */
    async compareNodes(node1Id: string, node2Id: string): Promise<number> {
        const tbl = this.tableName;
        const result = await this.pool.query(
            `SELECT (
                CASE
                    WHEN CAST($1 AS varchar) = CAST($2 AS varchar)
                    THEN 0
                    WHEN t1.left BETWEEN t2.left AND t2.right 
                    THEN -1
                    WHEN t2.left BETWEEN t1.left AND t1.right 
                    THEN 1
                    ELSE null 
                END
            ) AS "result"
            FROM "${tbl}" AS t1, "${tbl}" AS t2
            WHERE t1.id = CAST($1 AS uuid) AND t2.id = CAST($2 AS uuid)`,
            [node1Id, node2Id]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        const comparisonResult: number = result.rows[0]["result"];
        if (typeof comparisonResult === "number") return comparisonResult;
        return null;
    }

    private getInsertFields(insertFieldList: string[] = null) {
        const fieldList = isNonEmptyArray(insertFieldList)
            ? insertFieldList
            : this.defaultInsertFieldList;
        if (!isNonEmptyArray(fieldList)) {
            throw new Error("Insert fields must be an non-empty array!");
        }
        return fieldList;
    }

    private getNodesInsertSql(
        nodes: NodeRecord[],
        sqlValues: any[],
        insertFieldList: string[] = null,
        tableAliasOrName: string = ""
    ) {
        if (!isNonEmptyArray(nodes)) {
            throw new Error(
                "`sqlValues` parameter should be an non-empty array!"
            );
        }
        if (!_.isArray(sqlValues)) {
            throw new Error("`sqlValues` parameter should be an array!");
        }
        const tbl = this.tableName;
        const fieldList = this.getInsertFields(insertFieldList);

        const columnsList = fieldList
            .map(f =>
                tableAliasOrName == "" ? `"${f}"` : `${tableAliasOrName}."${f}"`
            )
            .join(", ");

        const valuesList = nodes
            .map(
                node =>
                    "(" +
                    fieldList
                        .map(f => {
                            sqlValues.push(node[f]);
                            return `$${sqlValues.length}`;
                        })
                        .join(", ") +
                    ")"
            )
            .join(", ");

        return `INSERT INTO "${tbl}" (${columnsList}) VALUES ${valuesList}`;
    }

    /**
     * Create the root node of the tree.
     * If a root node already exists, an error will be thrown.
     *
     * @param {NodeRecord} node
     * @returns {Promise<string>} newly created node ID
     * @memberof NestedSetModelQueryer
     */
    async createRootNode(node: NodeRecord): Promise<string> {
        const tbl = this.tableName;
        const client = await this.pool.connect();
        const fields = Object.keys(node);
        if (!fields.length) {
            throw new Error(
                "`node` parameter cannot be an empty object with no key."
            );
        }
        let node_id: string;
        try {
            await client.query("BEGIN");
            let result = await client.query(
                `SELECT id FROM "${tbl}" WHERE "left" = 1 LIMIT 1`
            );
            if (result && isNonEmptyArray(result.rows)) {
                throw new Error(
                    `A root node with id: ${
                        result.rows[0]["id"]
                    } already exists`
                );
            }
            const sqlValues: any[] = [];
            result = await client.query(
                this.getNodesInsertSql(
                    [
                        {
                            ...node,
                            left: node.left ? node.left : 1,
                            right: node.right ? node.right : 2
                        }
                    ],
                    sqlValues,
                    fields.concat(["left", "right"])
                ) + " RETURNING id",
                sqlValues
            );
            if (!result || !isNonEmptyArray(result.rows)) {
                throw new Error("Cannot locate create root node ID!");
            }
            await client.query("COMMIT");
            node_id = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        return node_id;
    }

    private async getNodeDataWithinTx(
        client: pg.Client,
        nodeId: string,
        fields: string[]
    ): Promise<NodeRecord> {
        const tbl = this.tableName;
        const fieldsList = fields.map(f => `"${f}"`).join(", ");
        const result = await client.query(
            `SELECT ${fieldsList} FROM "${tbl}" WHERE "id" = $1`,
            [nodeId]
        );
        if (!result || !isNonEmptyArray(result.rows)) {
            throw new Error(
                `Cannot locate tree node record with id: ${nodeId}`
            );
        }
        return result.rows[0];
    }

    /**
     * Insert a node to the tree under a parent node
     *
     * @param {NodeRecord} node
     * @param {string} parentNodeId
     * @returns {Promise<string>}
     * @memberof NestedSetModelQueryer
     */
    async insertNode(node: NodeRecord, parentNodeId: string): Promise<string> {
        if (!parentNodeId) {
            throw new Error("`parentNodeId` cannot be empty!");
        }
        const fields = Object.keys(node);
        if (!fields.length) {
            throw new Error(
                "`node` parameter cannot be an empty object with no key."
            );
        }
        const tbl = this.tableName;
        const client = await this.pool.connect();
        let node_id: string;
        try {
            await client.query("BEGIN");
            const { right: parentRight } = await this.getNodeDataWithinTx(
                client,
                parentNodeId,
                ["right"]
            );

            await client.query(
                `UPDATE "${tbl}" 
                SET 
                    "left" = CASE WHEN "left" > $1 THEN "left" + 2 ELSE "left" END,
                    "right" = CASE WHEN "right" >= $1 THEN "right" + 2 ELSE "right" END
                WHERE "right" >= $1`,
                [parentRight]
            );

            const sqlValues: any[] = [];
            const result = await client.query(
                this.getNodesInsertSql(
                    [
                        {
                            ...node,
                            left: parentRight,
                            right: parentRight + 1
                        }
                    ],
                    sqlValues,
                    fields.concat(["left", "right"])
                ) + " RETURNING id",
                sqlValues
            );

            if (!result || !isNonEmptyArray(result.rows)) {
                throw new Error("Cannot locate created node ID!");
            }
            await client.query("COMMIT");
            node_id = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        return node_id;
    }

    /**
     * Insert a node to the right of its sibling
     * If `siblingNodeId` belongs to a root node, an error will be thrown
     *
     * @param {NodeRecord} node
     * @param {string} siblingNodeId
     * @returns {Promise<string>}
     * @memberof NestedSetModelQueryer
     */
    async insertNodeToRightOfSibling(
        node: NodeRecord,
        siblingNodeId: string
    ): Promise<string> {
        if (!siblingNodeId) {
            throw new Error("`siblingNodeId` cannot be empty!");
        }
        const fields = Object.keys(node);
        if (!fields.length) {
            throw new Error(
                "`node` parameter cannot be an empty object with no key."
            );
        }
        const tbl = this.tableName;
        const client = await this.pool.connect();
        let node_id: string;
        try {
            await client.query("BEGIN");
            const {
                left: siblingLeft,
                right: siblingRight
            } = await this.getNodeDataWithinTx(client, siblingNodeId, [
                "left",
                "right"
            ]);

            if (siblingLeft === 1) {
                throw new Error("Cannot add sibling to the Root node!");
            }

            await client.query(
                `UPDATE "${tbl}" 
                SET 
                    "left" = CASE WHEN "left" < $1 THEN "left" ELSE "left" + 2 END,
                    "right" = CASE WHEN "right" < $1 THEN "right" ELSE "right" + 2 END
                WHERE "right" > $1`,
                [siblingRight]
            );

            const sqlValues: any[] = [];
            const result = await client.query(
                this.getNodesInsertSql(
                    [
                        {
                            ...node,
                            left: siblingRight + 1,
                            right: siblingRight + 2
                        }
                    ],
                    sqlValues,
                    fields.concat(["left", "right"])
                ) + " RETURNING id",
                sqlValues
            );

            if (!result || !isNonEmptyArray(result.rows)) {
                throw new Error("Cannot locate created node ID!");
            }
            await client.query("COMMIT");
            node_id = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        return node_id;
    }
}

export default NestedSetModelQueryer;
