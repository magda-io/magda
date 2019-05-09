import * as pg from "pg";
import * as _ from "lodash";

export interface NodeRecord {
    [key: string]: any;
}

class NestedSetModelQueryer {
    private pool: pg.Pool;
    private tableName: string;

    public defaultSelectFieldList: string[] = [];

    constructor(
        dbPool: pg.Pool,
        tableName: string,
        defaultSelectFieldList: string[] = null
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
        return this.defaultSelectFieldList
            .map(f =>
                tableAliasOrName ? `"${f}"` : `"${tableAliasOrName}"."${f}"`
            )
            .join(", ");
    }

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

    async getAllChildren(
        parentNodeId: string,
        includeMyself: boolean = false
    ): Promise<NodeRecord[]> {
        const tbl = this.tableName;

        const result = await this.pool.query(
            `SELECT ${this.selectFields("Children")} 
             FROM "${tbl}" AS "Parents",  "${tbl}" AS "Children"
             WHERE "Children"."left" ${
                 includeMyself ? ">=" : ">"
             } "Parents"."left" AND "Children"."left" ${
                includeMyself ? "<=" : "<"
            } "Parents"."right" AND "Parents"."id" = $1`,
            [parentNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
    }

    async getAllParents(
        childNodeId: string,
        includeMyself: boolean = false
    ): Promise<NodeRecord[]> {
        const tbl = this.tableName;

        const result = await this.pool.query(
            `SELECT ${this.selectFields("Parents")} 
             FROM "${tbl}" AS "Parents",  "${tbl}" AS "Children"
             WHERE "Children"."left" ${
                 includeMyself ? ">=" : ">"
             } "Parents"."left" AND "Children"."left" ${
                includeMyself ? "<=" : "<"
            } "Parents"."right" AND "Children"."id" = $1`,
            [childNodeId]
        );
        if (!result || !result.rows || !result.rows.length) return null;
        return result.rows;
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
}

export default NestedSetModelQueryer;
