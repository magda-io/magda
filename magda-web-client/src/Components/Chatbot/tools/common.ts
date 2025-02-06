import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { ChainInput } from "../commons";
import { runQuery } from "../../../libs/sqlUtils";

export async function getDistColumnNames(
    distIdx: number
): Promise<string[] | null> {
    const records = await runQuery(`SELECT * FROM source(${distIdx}) limit 1`);
    if (!records?.length) {
        return null;
    }
    const data = records[0];
    return Object.keys(data);
}
