import * as request from "request-promise-native";
import GenericError from "@magda/typescript-common/dist/authorization-api/GenericError";
import OpaCompileResponseParser from "@magda/typescript-common/dist/OpaCompileResponseParser";
import { DatasetAccessControlMetaData } from "@magda/typescript-common/dist/authorization-api/model";

async function getWhoAllowDatasetOperation(
    opaUrl: string,
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
    console.log(evalResult);
    return parser.evaluateRuleAsHumanReadableString(
        "data.partial.object.dataset.allow"
    );
}

export default getWhoAllowDatasetOperation;
