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
}

export default NestedSetModelQueryer;
