import * as pg from "pg";
import * as _ from "lodash";

export interface NodeRecord {
    [key: string]: any;
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
    public defaultSelectFieldList: string[] = [];

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
        defaultSelectFieldList: string[] = ["id", "name"]
    ) {
        if (!dbPool) throw new Error("dbPool cannot be empty!");
        if (!tableName) throw new Error("tableName cannot be empty!");

        this.pool = dbPool;
        this.tableName = tableName;

        if (!defaultSelectFieldList) return;
        if (!_.isArray(defaultSelectFieldList))
            throw new Error("defaultSelectFieldList should be an array");

        this.defaultSelectFieldList = defaultSelectFieldList;
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
        const level: number = result.rows[0]["level"];
        if (typeof level !== "number" || level < 1) return null;
        return level;
    }

    /**
     * Get total height (no. of the levels) of the tree
     * Starts with 1 level
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
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows[0]["height"];
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
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getTopDownPathBetween(
        higherNodeId: string,
        lowerNodeId: string
    ): Promise<NodeRecord> {
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
                    WHEN $1 = $2 
                    THEN 0
                    WHEN t1.left BETWEEN t2.left AND t2.right 
                    THEN -1
                    WHEN t2.left BETWEEN t1.left AND t1.right 
                    THEN 1
                    ELSE null 
                END
            ) AS "result"
            FROM "${tbl}" AS t1, "${tbl}" AS t2
            WHERE t1.id = $1 AND t2.id = $2`,
            [node1Id, node2Id]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        const comparisonResult: number = result.rows[0]["result"];
        if (typeof comparisonResult === "number") return comparisonResult;
        return null;
    }
}

export default NestedSetModelQueryer;
