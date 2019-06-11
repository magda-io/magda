import * as request from "request-promise-native";
import * as _ from "lodash";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import isUuid from "@magda/typescript-common/dist/util/isUuid";
import OpaCompileResponseParser, {
    RegoRef,
    RegoExp
} from "@magda/typescript-common/dist/OpaCompileResponseParser";
import {
    DatasetAccessControlMetaData,
    User
} from "@magda/typescript-common/dist/authorization-api/model";
import * as pg from "pg";

const INVALID_CHAR_REGEX = /[^a-z_\d\.]/i;

function isValidSqlIdentifier(id: string): boolean {
    if (INVALID_CHAR_REGEX.test(id)) return false;
    return true;
}

const VALID_REF_PREFIX_LIST: {
    [key: string]: string | ((refString: string) => string);
} = {
    "input.user.permissions[_]": (ref: string): string => {
        const sqlIdentiderParts = ref
            .replace("input.user.permissions[_]", "permissions")
            .split(".");
        // --- convert camelCase field name to snakecase field name for SQL indentifier
        sqlIdentiderParts[sqlIdentiderParts.length - 1] = _.snakeCase(
            sqlIdentiderParts[sqlIdentiderParts.length - 1]
        );

        const sqlIdentider = sqlIdentiderParts.join(".");
        if (!isValidSqlIdentifier(sqlIdentider)) {
            throw new Error(`Invalid Sql Identifier ${sqlIdentider} produced.`);
        }
        return sqlIdentider;
    },
    "input.user.permissions[_].operations[_]": (ref: string): string => {
        const sqlIdentiderParts = ref
            .replace("input.user.permissions[_].operations[_]", "operations")
            .split(".");
        // --- convert camelCase field name to snakecase field name for SQL indentifier
        sqlIdentiderParts[sqlIdentiderParts.length - 1] = _.snakeCase(
            sqlIdentiderParts[sqlIdentiderParts.length - 1]
        );

        const sqlIdentider = sqlIdentiderParts.join(".");
        if (!isValidSqlIdentifier(sqlIdentider)) {
            throw new Error(`Invalid Sql Identifier ${sqlIdentider} produced.`);
        }
        return sqlIdentider;
    },
    "input.user.managingOrgUnitIds[_]": (ref: string): string => {
        if (ref !== "input.user.managingOrgUnitIds[_]") {
            throw new Error(`Invalid ref returned from OPA: ${ref}`);
        }
        return `(SELECT Children."id"
        FROM org_units AS Parents, org_units AS Children
        WHERE Children."left" >= Parents."left" AND Children."left" <= Parents."right" AND Parents."id" = users."orgUnitId")`;
    },
    "input.user.id": "users.id",
    "input.user.permissions[_].resourceUri": "resources.uri"
};

function isValidRef(ref: string): boolean {
    return (
        Object.keys(VALID_REF_PREFIX_LIST).findIndex(
            item => ref.indexOf(item) === 0
        ) !== -1
    );
}

function regoRefToSqlIdentifier(ref: RegoRef): string {
    const refString = ref.fullRefString();
    if (!isValidRef(refString)) {
        throw new Error(`Invalid ref: ${ref.fullRefString()}`);
    }
    const prefixes = Object.keys(VALID_REF_PREFIX_LIST).sort(
        (a: string, b: string) => b.length - a.length
    );
    for (let i = 0; i < prefixes.length; i++) {
        const prefix = prefixes[i];
        if (!prefix) continue;
        const idx = refString.indexOf(prefix);
        if (idx !== 0) continue;
        if (typeof VALID_REF_PREFIX_LIST[prefix] === "function") {
            return (VALID_REF_PREFIX_LIST[prefix] as Function)(refString);
        } else if (typeof VALID_REF_PREFIX_LIST[prefix] === "string") {
            return VALID_REF_PREFIX_LIST[prefix] as string;
        } else {
            throw new Error("Invalid VALID_REF_PREFIX_LIST item type!");
        }
    }
    return refString;
}

function regoExpToSql(exp: RegoExp, sqlParameters: any[]): string {
    const [operator, operands] = exp.toOperatorOperandsArray();
    if (operands.findIndex(term => !term.isResolveAsCollectionValue()) === -1) {
        // --- both operands are CollectionRef? not possible
        throw new Error(`Invalid expression ${exp.toHumanReadableString()}`);
    }
    let operatorString = operator;
    if (operands.findIndex(term => term.isResolveAsCollectionValue()) !== -1) {
        // --- one ref can be resolved to a collection value
        // --- convert operator to relevant collection operators
        if (operatorString === "=") {
            operatorString = "IN";
        } else if (operatorString === "!=") {
            operatorString = "NOT IN";
        } else {
            throw new Error(
                `Invalid operator found for expression: ${exp.toHumanReadableString()}`
            );
        }
    }
    const operandParts = operands.map(operandTerm => {
        if (operandTerm.isRef()) {
            return regoRefToSqlIdentifier(operandTerm.getRef());
        } else {
            const value = operandTerm.getValue();
            sqlParameters.push(value);
            return isUuid(value)
                ? `$${sqlParameters.length}::uuid`
                : `$${sqlParameters.length}`;
        }
    });
    return `${operandParts[0]} ${operatorString} ${operandParts[1]}`;
}

async function getWhoAllowDatasetOperation(
    opaUrl: string,
    pool: pg.Pool,
    dataset: DatasetAccessControlMetaData,
    operation: string
): Promise<User[]> {
    const res = await request(`${opaUrl}v1/compile`, {
        method: "post",
        json: {
            query: "data.object.dataset.allow == true",
            input: {
                operationUri: operation,
                object: {
                    dataset
                }
            },
            unknowns: ["input.user"]
        }
    });
    const parser = new OpaCompileResponseParser();
    parser.parse(res);
    const evalResult = parser.evaluateRule("data.partial.object.dataset.allow");
    if (
        !Array.isArray(evalResult.residualRules) ||
        !evalResult.residualRules.length
    ) {
        if (evalResult.isCompleteEvaluated && evalResult.value === false) {
            return [];
        }
        // --- it's unlikely there is no residual rules left (means all users are allowed)
        // --- if so, we must have an error in our policy
        throw new GenericError(
            "Invalid access control policy evaluation result!"
        );
    }
    const sqlParameters: any[] = [];
    let ruleConditions = evalResult.residualRules
        .map(rule =>
            rule.expressions
                .map(exp => regoExpToSql(exp, sqlParameters))
                .join(" AND ")
        )
        .join(" ) OR ( ");
    ruleConditions = ruleConditions ? `WHERE (${ruleConditions})` : "";

    const sql = `
        SELECT users.*
        FROM users
        LEFT JOIN user_roles ON user_roles.user_id = users.id
        LEFT JOIN role_permissions ON role_permissions.role_id = user_roles.role_id
        LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
        LEFT JOIN resources ON resources.id = permissions.resource_id
        LEFT JOIN permission_operations ON permission_operations.permission_id = role_permissions.permission_id
        LEFT JOIN operations ON operations.id = permission_operations.operation_id
        ${ruleConditions} 
        GROUP BY users.id
    `;

    const queryResult = await pool.query(sql, sqlParameters);

    if (!queryResult || !queryResult.rows) {
        return [];
    }
    return queryResult.rows;
}

export default getWhoAllowDatasetOperation;
