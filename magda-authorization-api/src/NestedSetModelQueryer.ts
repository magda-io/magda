import pg from "pg";
import _ from "lodash";
import { Maybe } from "tsmonad";
import SQLSyntax, { sqls } from "sql-syntax";
import { escapeIdentifier } from "magda-typescript-common/src/SQLUtils";
import AuthDecision, {
    UnconditionalTrueDecision
} from "magda-typescript-common/src/opa/AuthDecision";
import isUuid from "magda-typescript-common/src/util/isUuid";
const textTree = require("text-treeview");

export interface NodeRecord {
    id?: string;
    name: string;
    description?: string;
    [key: string]: any;
}

export class NodeNotFoundError extends Error {}

function isNonEmptyArray(v: any): boolean {
    if (!v || !_.isArray(v) || !v.length) return false;
    return true;
}

const INVALID_CHAR_REGEX = /[^a-z_\d]/i;

function isValidSqlIdentifier(id: string): boolean {
    if (INVALID_CHAR_REGEX.test(id)) return false;
    return true;
}

export type TextTreeNode =
    | string
    | {
          text: string;
          children?: TextTreeNode[];
      };

export type CompareNodeResult =
    | "ancestor"
    | "descendant"
    | "equal"
    | "unrelated";

type NodesQuery = {
    name?: string;
    leafNodesOnly?: boolean;
};
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
        if (!isValidSqlIdentifier(tableName)) {
            throw new Error(
                `tableName: ${tableName} contains invalid characters!`
            );
        }

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

    private selectFields(
        tableAliasOrName: string = "",
        fields: string[] = null
    ): SQLSyntax {
        const fieldList = isNonEmptyArray(fields)
            ? fields
            : this.defaultSelectFieldList;
        if (!isNonEmptyArray(fieldList)) {
            return sqls`*`;
        }
        if (!isValidSqlIdentifier(tableAliasOrName)) {
            throw new Error(
                `'tableAliasOrName' ${tableAliasOrName} contains invalid characters.`
            );
        }
        // --- do not double quote `tableAliasOrName`
        // --- or you will get missing FROM-clause entry for table error
        return SQLSyntax.createUnsafely(
            fieldList
                .map((f) => {
                    if (!isValidSqlIdentifier(f)) {
                        throw new Error(
                            `Field name ${f} contains invalid characters.`
                        );
                    }
                    return tableAliasOrName === ""
                        ? `"${f}"`
                        : `${tableAliasOrName}."${f}"`;
                })
                .join(", ")
        );
    }

    /**
     * Get nodes by name
     * You hardly need this one --- only for write test case (you can get a id from name)
     *
     * @param {string} name
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getNodes(
        nodesQuery: NodesQuery = {},
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"]
        });
        const clauses = [
            authConditions,
            nodesQuery.name
                ? sqls`"name" = ${nodesQuery.name}`
                : SQLSyntax.empty,
            nodesQuery.leafNodesOnly
                ? sqls`"left" = ( "right" - 1 )`
                : SQLSyntax.empty
        ];
        const whereClause = SQLSyntax.where(SQLSyntax.joinWithAnd(clauses));

        const query = sqls`SELECT ${this.selectFields(
            "",
            fields
        )} FROM ${escapeIdentifier(this.tableName)} ${whereClause}`;

        const result = await (client ? client : this.pool).query(
            ...query.toQuery()
        );
        if (!result || !result.rows || !result.rows.length) return [];
        return result.rows;
    }

    /**
     *
     * Get a node by its id
     * @param {string} id
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getNodeById(
        id: string,
        fields: string[] = null,
        client: pg.PoolClient = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<NodeRecord>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"]
        });
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields(
                "",
                fields
            )} FROM ${escapeIdentifier(
                this.tableName
            )} WHERE ${SQLSyntax.joinWithAnd([
                sqls`"id" = ${id}`,
                authConditions
            ])}`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            return Maybe.nothing();
        return Maybe.just(result.rows[0]);
    }

    /**
     * Get the root node of the tree
     * Return null if empty tree or the user has no access to the root node
     *
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getRootNode(
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<NodeRecord>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"]
        });
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields(
                "",
                fields
            )} FROM ${escapeIdentifier(
                this.tableName
            )} WHERE ${SQLSyntax.joinWithAnd([
                sqls`"left" = 1`,
                authConditions
            ])}`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            return Maybe.nothing();
        return Maybe.just(result.rows[0]);
    }

    /**
     * Get All children of a given node
     * (including immediate children and children of immediate children etc.)
     * If the node has no child (i.e. a leaf node), an empty array will be returned
     *
     * @param {string} parentNodeId
     * @param {boolean} [includeMyself=false]
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getAllChildren(
        parentNodeId: string,
        includeMyself: boolean = false,
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "children"
        });
        const tbl = escapeIdentifier(this.tableName);
        const conditions = [
            sqls`Children."left" ${
                includeMyself ? sqls`>=` : sqls`>`
            } Parents."left"`,
            sqls`Children."left" ${
                includeMyself ? sqls`<=` : sqls`<`
            } Parents."right"`,
            sqls`Parents."id" = ${parentNodeId}`,
            authConditions
        ];
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields("Children", fields)} 
             FROM ${tbl} AS Parents,  ${tbl} AS Children
             WHERE ${SQLSyntax.joinWithAnd(conditions)}`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length) return [];
        return result.rows;
    }

    /**
     * Get All parents of a given node
     * (including immediate parent and parents of immediate parent etc.)
     * If the node has no parent (i.e. a root node), an empty array will be returned (unless `includeMyself` = true)
     *
     * @param {string} childNodeId
     * @param {boolean} [includeMyself=false]
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getAllParents(
        childNodeId: string,
        includeMyself: boolean = false,
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "parents"
        });
        const tbl = escapeIdentifier(this.tableName);
        const conditions = [
            sqls`Children."left" ${
                includeMyself ? sqls`>=` : sqls`>`
            } Parents."left"`,
            sqls`Children."left" ${
                includeMyself ? sqls`<=` : sqls`<`
            } Parents."right"`,
            sqls`Children."id" = ${childNodeId}`,
            authConditions
        ];
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields("Parents", fields)} 
             FROM ${tbl} AS Parents, ${tbl} AS Children
             WHERE ${SQLSyntax.joinWithAnd(conditions)}`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length) return [];
        return result.rows;
    }

    /**
     * Get Immediate Children of a Node
     * If the node has no child (i.e. a leaf node), an empty array will be returned
     *
     * @param {string} parentNodeId
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getImmediateChildren(
        parentNodeId: string,
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "children"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields("Children", fields)} 
            FROM ${tbl} AS Parents, ${tbl} AS Children
            WHERE Children."left" BETWEEN Parents."left" AND Parents."right" 
            AND Parents."left" = (
                SELECT MAX(S."left") FROM ${tbl} AS S
                WHERE S."left" < Children."left" AND S."right" > Children."right"
            ) 
            AND Parents."id" = ${parentNodeId}
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }
            ORDER BY Children."left" ASC`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length) return [];
        return result.rows;
    }

    /**
     * Get Immediate Parent of a Node
     * If the node has no parent (i.e. a root node), null will be returned
     *
     * @param {string} childNodeId
     * @param {string[]} [fields=null] Selected Fields; If null, use this.defaultSelectFieldList
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<NodeRecord>}
     * @memberof NestedSetModelQueryer
     */
    async getImmediateParent(
        childNodeId: string,
        fields: string[] = null,
        client: pg.Client = null,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<NodeRecord>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "parents"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await (client ? client : this.pool).query(
            ...sqls`SELECT ${this.selectFields("Parents", fields)} 
            FROM ${tbl} AS Parents, ${tbl} AS Children
            WHERE Children.left BETWEEN Parents.left AND Parents.right 
            AND Parents.left = (
                SELECT MAX(S.left) FROM ${tbl} AS S
                WHERE S.left < Children.left AND S.right > Children.right
            ) 
            AND Children.id = ${childNodeId}
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            return Maybe.nothing();
        return Maybe.just(result.rows[0]);
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
    async getAllNodesAtLevel(
        level: number,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "t2"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT ${this.selectFields("t2")}
            FROM ${tbl} AS t1, ${tbl} AS t2
            WHERE t2.left BETWEEN t1.left AND t1.right
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }
            GROUP BY t2.id 
            HAVING COUNT(t1.id) = ${level}`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length) return [];
        return result.rows;
    }

    /**
     * Get level no. of a given node
     * Starts from 1. i.e. The root node is 1
     *
     * @param {string} nodeId
     * @returns {Promise<number>}
     * @throws NodeNotFoundError If the node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async getLevelOfNode(
        nodeId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<number> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "parents"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT COUNT(Parents.id) AS level 
            FROM ${tbl} AS Parents, ${tbl} AS Children
            WHERE Children.left BETWEEN Parents.left AND Parents.right AND Children.id = ${nodeId}
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            throw new NodeNotFoundError();
        const level: number = parseInt(result.rows[0]["level"]);
        if (!_.isNumber(level) || _.isNaN(level) || level < 1)
            throw new Error(
                `Could find a valid level for node ${nodeId}: ${level}`
            );
        return level;
    }

    /**
     * Get total height (no. of the levels) of the tree
     * Starts with 1 level.
     *
     * @returns {Promise<number>}
     * @throws NodeNotFoundError If the root node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async getTreeHeight(
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<number> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "t1"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT MAX(level) AS height 
             FROM(
                SELECT COUNT(t1.id)
                FROM ${tbl} AS t1, ${tbl} AS t2
                WHERE t2.left BETWEEN t1.left AND t1.right 
                ${
                    authConditions.isEmpty
                        ? SQLSyntax.empty
                        : sqls` AND ${authConditions}`
                }
                GROUP BY t2.id 
             ) AS L(level)`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            throw new NodeNotFoundError();
        const height: number = parseInt(result.rows[0]["height"]);
        if (!_.isNumber(height) || _.isNaN(height) || height < 0)
            throw new Error(`Invalid height for tree: ${height}`);
        return height;
    }

    /**
     * Get left most immediate child of a node
     *
     * @param {string} parentNodeId
     * @returns {Promise<Maybe<NodeRecord>>}
     * @memberof NestedSetModelQueryer
     */
    async getLeftMostImmediateChild(
        parentNodeId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<NodeRecord>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "children"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT ${this.selectFields("Children")}
            FROM ${tbl} AS Parents, ${tbl} AS Children 
            WHERE Children.left = Parents.left + 1 AND Parents.id = ${parentNodeId}
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            return Maybe.nothing();
        return Maybe.just(result.rows[0]);
    }

    /**
     * Get right most immediate child of a node
     *
     * @param {string} parentNodeId
     * @returns {Promise<Maybe<NodeRecord>>}
     * @memberof NestedSetModelQueryer
     */
    async getRightMostImmediateChild(
        parentNodeId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<Maybe<NodeRecord>> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "children"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT ${this.selectFields("Children")}
            FROM ${tbl} AS Parents, ${tbl} AS Children 
            WHERE Children.right = Parents.right - 1 AND Parents.id = ${parentNodeId}
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }`.toQuery()
        );
        if (!result || !result.rows || !result.rows.length)
            return Maybe.nothing();
        return Maybe.just(result.rows[0]);
    }

    /**
     * Get all nodes on the top to down path between the `higherNode` to the `lowerNode`
     * Sort from higher level nodes to lower level node.
     * Result will include `higherNode` and the `lowerNode`.
     * If `higherNode` and the `lowerNode` is the same node, an array contains the single node will be return.
     * If a path doesn't exist, empty array (`[]`) will be returned
     * If you pass a lower node to the `higherNodeId` and a higher node to `lowerNodeId`, empty array will be returned
     *
     * @param {string} higherNodeId
     * @param {string} lowerNodeId
     * @returns {Promise<Maybe<NodeRecord[]>}
     * @memberof NestedSetModelQueryer
     */
    async getTopDownPathBetween(
        higherNodeId: string,
        lowerNodeId: string,
        authDecision: AuthDecision = UnconditionalTrueDecision
    ): Promise<NodeRecord[]> {
        const authConditions = authDecision.toSql({
            prefixes: ["input.authObject.orgUnit"],
            tableRef: "t2"
        });
        const tbl = escapeIdentifier(this.tableName);
        const result = await this.pool.query(
            ...sqls`SELECT ${this.selectFields("t2")}
            FROM ${tbl} AS t1, ${tbl} AS t2, ${tbl} AS t3 
            WHERE t1.id = ${higherNodeId} AND t3.id = ${lowerNodeId}
            AND t2.left BETWEEN t1.left AND t1.right 
            AND t3.left BETWEEN t2.left AND t2.right
            ${
                authConditions.isEmpty
                    ? SQLSyntax.empty
                    : sqls` AND ${authConditions}`
            }
            ORDER BY (t2.right-t2.left) DESC`.toQuery()
        );
        if (!result?.rows?.length) {
            return [];
        } else {
            return result.rows;
        }
    }

    /**
     * Compare the relative position of the two nodes
     * If node1 is superior to node2, return "ancestor"
     * if node1 is the subordinate of node2, return "descendant"
     * If node1 = node2 return "equal"
     * If there is no path can be found between Node1 and Node2 return "unrelated"
     *
     * @param {string} node1Id
     * @param {string} node2Id
     * @param {pg.Client} [client=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<CompareNodeResult>}
     * @memberof NestedSetModelQueryer
     */
    async compareNodes(
        node1Id: string,
        node2Id: string,
        client: pg.PoolClient = null
    ): Promise<CompareNodeResult> {
        const tbl = this.tableName;
        const result = await (client ? client : this.pool).query(
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
        if (!result || !result.rows || !result.rows.length) return "unrelated";
        const comparisonResult: number = result.rows[0]["result"];
        if (typeof comparisonResult === "number") {
            switch (comparisonResult) {
                case 1:
                    return "ancestor";
                case -1:
                    return "descendant";
                case 0:
                    return "equal";
            }
        }
        return "unrelated";
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

        if (!isValidSqlIdentifier(tableAliasOrName)) {
            throw new Error(
                `tableAliasOrName: ${tableAliasOrName} contains invalid characters!`
            );
        }

        const tbl = this.tableName;
        const fieldList = this.getInsertFields(insertFieldList);

        const columnsList = fieldList
            .map((f) => {
                if (!isValidSqlIdentifier(f)) {
                    throw new Error(
                        `column name: ${f} contains invalid characters!`
                    );
                }
                return tableAliasOrName == ""
                    ? `"${f}"`
                    : `${tableAliasOrName}."${f}"`;
            })
            .join(", ");

        const valuesList = nodes
            .map(
                (node) =>
                    "(" +
                    fieldList
                        .map((f) => {
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
     * @param {pg.Client} [existingClient=null] Optional pg client; Use supplied client connection for query rather than a random connection from Pool
     * @returns {Promise<string>} newly created node ID
     * @memberof NestedSetModelQueryer
     */
    async createRootNode(
        node: NodeRecord,
        existingClient: pg.PoolClient = null
    ): Promise<string> {
        const tbl = this.tableName;
        const client = existingClient
            ? existingClient
            : await this.pool.connect();
        const fields = Object.keys(node);
        if (!fields.length) {
            throw new Error(
                "`node` parameter cannot be an empty object with no key."
            );
        }
        let nodeId: string;
        try {
            await client.query("BEGIN");
            let result = await client.query(
                `SELECT "id" FROM "${tbl}" WHERE "left" = 1 LIMIT 1`
            );
            if (result && isNonEmptyArray(result.rows)) {
                throw new Error(
                    `A root node with id: ${result.rows[0]["id"]} already exists`
                );
            }
            const countResult = await client.query(
                `SELECT COUNT("id") AS "num" FROM "${tbl}" WHERE "left" != 1`
            );
            let countNum =
                countResult && countResult.rows && countResult.rows.length
                    ? parseInt(countResult.rows[0].num)
                    : 0;
            countNum = isNaN(countNum) ? 0 : countNum;

            const right = countNum ? (countNum + 1) * 2 : 2;

            const sqlValues: any[] = [];
            result = await client.query(
                this.getNodesInsertSql(
                    [
                        {
                            ...node,
                            left: 1,
                            right
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
            nodeId = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            if (!existingClient) {
                client.release();
            }
        }
        return nodeId;
    }

    private async getNodeDataWithinTx(
        client: pg.PoolClient,
        nodeId: string,
        fields: string[]
    ): Promise<NodeRecord> {
        const node = await this.getNodeById(nodeId, fields, client);

        return node.caseOf({
            just: (node) => node,
            nothing: () => {
                throw new NodeNotFoundError(
                    `Cannot locate tree node record with id: ${nodeId}`
                );
            }
        });
    }

    /**
     * Insert a node to the tree under a parent node
     *
     * @param {string} parentNodeId
     * @param {NodeRecord} node
     * @returns {Promise<string>}
     * @throws NodeNotFoundError if parent node not found
     * @memberof NestedSetModelQueryer
     */
    async insertNode(parentNodeId: string, node: NodeRecord): Promise<string> {
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
        let nodeId: string;
        try {
            await client.query("BEGIN");
            const {
                right: parentRight
            } = await this.getNodeDataWithinTx(client, parentNodeId, ["right"]);

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
            nodeId = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        return nodeId;
    }

    /**
     * Insert a node to the right of its sibling
     * If `siblingNodeId` belongs to a root node, an error will be thrown
     *
     * @param {string} siblingNodeId
     * @param {NodeRecord} node
     * @returns {Promise<string>}
     * @throws NodeNotFoundError If the node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async insertNodeToRightOfSibling(
        siblingNodeId: string,
        node: NodeRecord
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
        let nodeId: string;
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
            nodeId = result.rows[0]["id"];
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
        return nodeId;
    }

    /**
     * Move a subtree (the specified root node and all its subordinates)
     * to under a new parent.
     *
     * If the specifed sub tree root node is a child of the new parent node,
     * an error will be be thrown
     *
     * @param {string} subTreeRootNodeId
     * @param {string} newParentId
     * @returns {Promise<void>}
     * @throws NodeNotFoundError If the node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async moveSubTreeTo(
        subTreeRootNodeId: string,
        newParentId: string
    ): Promise<void> {
        if (!subTreeRootNodeId) {
            throw new Error("`subTreeRootNodeId` cannot be empty!");
        }
        if (!newParentId) {
            throw new Error("`newParentId` cannot be empty!");
        }
        const tbl = this.tableName;
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const comparisonResult = await this.compareNodes(
                subTreeRootNodeId,
                newParentId,
                client
            );
            if (comparisonResult === "ancestor") {
                throw new Error(
                    `Cannot move a higher level node (id: ${subTreeRootNodeId})to its subordinate (id: ${newParentId})`
                );
            }
            const {
                left: originRootLeft,
                right: originRootRight
            } = await this.getNodeDataWithinTx(client, subTreeRootNodeId, [
                "left",
                "right"
            ]);

            if (originRootLeft === "1") {
                throw new Error("Cannot move Tree root node as substree.");
            }

            const {
                right: newParentRight
            } = await this.getNodeDataWithinTx(client, newParentId, ["right"]);

            await client.query(
                `
            UPDATE "${tbl}" 
            SET 
            "left" = "left" + CASE
                WHEN $3::int4 < $1::int4
                THEN CASE 
                    WHEN "left" BETWEEN $1 AND $2
                    THEN $3 - $1
                    WHEN "left" BETWEEN $3 AND ($1 - 1)
                    THEN $2 - $1 + 1
                    ELSE 0 END
                WHEN $3::int4 > $2::int4
                THEN CASE
                    WHEN "left" BETWEEN $1 AND $2
                    THEN $3 - $2 - 1
                    WHEN "left" BETWEEN ($2 + 1) AND ($3 - 1)
                    THEN $1 - $2 - 1
                    ELSE 0 END
                ELSE 0 END,
            "right" = "right" + CASE
                WHEN $3::int4 < $1::int4
                THEN CASE 
                    WHEN "right" BETWEEN $1 AND $2
                    THEN $3 - $1
                    WHEN "right" BETWEEN $3 AND ($1 - 1)
                    THEN $2 - $1 + 1
                    ELSE 0 END
                WHEN $3::int4 > $2::int4
                THEN CASE
                    WHEN "right" BETWEEN $1 AND $2
                    THEN $3 - $2 - 1
                    WHEN "right" BETWEEN ($2 + 1) AND ($3 - 1)
                    THEN $1 - $2 - 1
                    ELSE 0 END
                ELSE 0 END
            `,
                [originRootLeft, originRootRight, newParentRight]
            );
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a subtree (and all its dependents)
     * If you sent in a root node id (and `allowRootNodeId` is true), the whole tree will be removed
     * When `allowRootNodeId` is false and you passed a root node id, an error will be thrown
     *
     * @param {string} subTreeRootNodeId
     * @param {boolean} [allowRootNodeId=false]
     * @returns {Promise<void>}
     * @throws NodeNotFoundError If the node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async deleteSubTree(
        subTreeRootNodeId: string,
        allowRootNodeId: boolean = false
    ): Promise<void> {
        if (!subTreeRootNodeId) {
            throw new Error("`subTreeRootNodeId` cannot be empty!");
        }
        const tbl = this.tableName;
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const {
                left: subTreeRootLeft,
                right: subTreeRootRight
            } = await this.getNodeDataWithinTx(client, subTreeRootNodeId, [
                "left",
                "right"
            ]);

            if (subTreeRootLeft === 1 && !allowRootNodeId) {
                throw new Error("Root node id is not allowed!");
            }

            // --- delete the sub tree nodes
            await client.query(
                `DELETE FROM "${tbl}" WHERE "left" BETWEEN $1 AND $2`,
                [subTreeRootLeft, subTreeRootRight]
            );
            // --- closing the gap after deletion
            await client.query(
                `
                UPDATE "${tbl}"
                SET "left" = CASE
                        WHEN "left" > $1
                            THEN "left" - ($2 - $1 + 1)
                        ELSE "left" END, 
                    "right" = CASE
                        WHEN "right" > $1
                            THEN "right" - ($2 - $1 + 1) 
                        ELSE "right" END
                WHERE "left" > $1 OR "right" > $1
                `,
                [subTreeRootLeft, subTreeRootRight]
            );
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a single node from the tree
     * Its childrens will become its parent's children
     * Deleting a root node is not allowed.
     * You can, however, delete the whole sub tree from root node or update the root node, instead.
     *
     * @param {string} nodeId
     * @returns {Promise<void>}
     * @throws NodeNotFoundError If the node can't be found in the tree
     * @memberof NestedSetModelQueryer
     */
    async deleteNode(nodeId: string): Promise<void> {
        if (!nodeId) {
            throw new Error("`nodeId` cannot be empty!");
        }
        const tbl = this.tableName;
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const {
                left: subTreeRootLeft,
                right: subTreeRootRight
            } = await this.getNodeDataWithinTx(client, nodeId, [
                "left",
                "right"
            ]);

            if (subTreeRootLeft === 1) {
                throw new Error("Delete a root node is not allowed!");
            }

            // --- delete the node
            // --- In nested set model, children are still bind to the deleted node's parent after deletion
            await client.query(`DELETE FROM "${tbl}" WHERE "id" = $1`, [
                nodeId
            ]);
            // --- closing the gap after deletion
            await client.query(
                `
                UPDATE "${tbl}"
                SET "left" = CASE
                        WHEN "left" > $1 AND "right" < $2
                            THEN "left" - 1
                        WHEN "left" > $1 AND "right" > $2
                            THEN "left" - 2
                        ELSE "left" END, 
                    "right" = CASE
                        WHEN "left" > $1 AND "right" < $2
                            THEN "right" - 1
                        ELSE ("right" - 2) END
                WHERE "left" > $1 OR "right" > $1
                `,
                [subTreeRootLeft, subTreeRootRight]
            );
            await client.query("COMMIT");
        } catch (e) {
            await client.query("ROLLBACK");
            throw e;
        } finally {
            client.release();
        }
    }

    /**
     * Update node data of the node specified by the nodeId
     * The followings fields will be ignored (as they should be generated by program):
     * - `left`
     * - `right`
     * - `id`
     *
     * @param {string} nodeId
     * @param {NodeRecord} nodeData
     * @param {pg.Client} [client=null]
     * @returns {Promise<void>}
     * @memberof NestedSetModelQueryer
     */
    async updateNode(
        nodeId: string,
        nodeData: NodeRecord,
        client: pg.Client = null
    ): Promise<void> {
        if (!isUuid(nodeId)) {
            throw new Error("nodeId is not valid UUID!");
        }
        const sqlUpdates: SQLSyntax[] = Object.keys(nodeData)
            .filter((k) => k !== "left" && k !== "right" && k !== "id")
            .map(
                (fieldName) =>
                    sqls`${escapeIdentifier(fieldName)} = ${
                        nodeData[fieldName]
                    }`
            );

        if (!sqlUpdates.length) {
            console.log("update node parameter: ", nodeId, nodeData);
            throw new Error("No valid node data passed for updating.");
        }

        await (client ? client : this.pool).query(
            ...sqls`UPDATE ${escapeIdentifier(
                this.tableName
            )} SET ${SQLSyntax.join(
                sqlUpdates,
                sqls` , `
            )} WHERE "id" = ${nodeId}`.toQuery()
        );
    }

    private async getChildTextTreeNodes(
        parentId: string
    ): Promise<TextTreeNode[]> {
        const nodes = await this.getImmediateChildren(parentId);
        if (!nodes || !nodes.length) return [];
        const textNodeList: TextTreeNode[] = [];
        for (let i = 0; i < nodes.length; i++) {
            const nodeChildren = await this.getChildTextTreeNodes(nodes[i].id);
            if (nodeChildren.length) {
                textNodeList.push({
                    text: nodes[i].name,
                    children: nodeChildren
                });
            } else {
                textNodeList.push(nodes[i].name);
            }
        }
        return textNodeList;
    }

    /**
     * Generate the Text View of the tree
     * Provided as Dev tool only
     *
     * E.g. output could be:
     * └─ Albert
     *      ├─ Chuck
     *      │  ├─ Fred
     *      │  ├─ Eddie
     *      │  └─ Donna
     *      └─ Bert
     *
     * @returns {Promise<string>}
     * @memberof NestedSetModelQueryer
     */
    async getTreeTextView(): Promise<string> {
        const rootNodeMaybe = await this.getRootNode();

        return rootNodeMaybe.caseOf({
            just: async (rootNode) => {
                const tree: TextTreeNode[] = [];
                const children = await this.getChildTextTreeNodes(rootNode.id);
                if (children.length) {
                    tree.push({
                        text: rootNode.name,
                        children
                    });
                } else {
                    tree.push(rootNode.name);
                }
                return textTree(tree);
            },
            nothing: async () => "Empty Tree"
        });
    }
}

export default NestedSetModelQueryer;
