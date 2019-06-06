import * as request from "request-promise-native";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import OpaCompileResponseParser, {
    RegoRef
} from "@magda/typescript-common/dist/OpaCompileResponseParser";
import { DatasetAccessControlMetaData } from "@magda/typescript-common/dist/authorization-api/model";
import Database from "./Database";

const VALID_TABLE_REF_LIST = [
    "input.user.permissions[_]",
    "input.user.permissions[_].operations[_]",
    "input.user.managingOrgUnitIds[_]"
];

function isValidRef(ref: string): boolean {
    return (
        VALID_TABLE_REF_LIST.findIndex(item => ref.indexOf(item) === 0) !== -1
    );
}

function regoRefToSql(ref: RegoRef, sqlParameters: any[]): string {
    return "";
}

async function getWhoAllowDatasetOperation(
    opaUrl: string,
    db: Database,
    dataset: DatasetAccessControlMetaData,
    operation: string
) {
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
        // --- it's unlikely there is no residual rules left (means all users are allowed)
        // --- if so, we must have an error in our policy
        throw new GenericError(
            "Invalid access control policy evaluation result!"
        );
    }
    const sqlParameters: any[] = [];
    const ruleConditions = evalResult.residualRules.map(rule =>
        rule.expressions.map(exp => {
            const [operator, operands] = exp.toOperatorOperandsArray();
            operands.map(operandTerm => {
                if (operandTerm.isRef()) {
                    const fullRef = operandTerm.fullRefString();
                }
            });
        })
    );

    const pool = db.getPool();
    const sql = `
    SELECT *
    FROM users
    LEFT JOIN user_roles ON user_roles.user_id = users.id
    LEFT JOIN role_permissions ON role_permissions.role_id = user_roles.role_id
    LEFT JOIN permissions ON permissions.id = role_permissions.permission_id
    LEFT JOIN permission_operations ON permission_operations.permission_id = role_permissions.permission_id
    LEFT JOIN operations ON operations.id = permission_operations.operation_id
    `;

    console.log(evalResult);
    return parser.evaluateRuleAsHumanReadableString(
        "data.partial.object.dataset.allow"
    );
}

export default getWhoAllowDatasetOperation;
