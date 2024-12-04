import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { ChainInput } from "../commons";
import { ParsedDistribution } from "helpers/record";
import { runQuery } from "../../../libs/sqlUtils";
import { WebLLMTool } from "../ChatWebLLM";
import toYaml from "libs/toYaml";

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

async function queryDataFilesWithSQLQuery(this: ChainInput, sqlQuery: string) {
    this.queue.push(createChatEventMessageCompleteMsg("Executing queries..."));
    const records = await runQuery<Record<string, any>[]>(sqlQuery);
    if (!records?.length) {
        this.queue.push(
            createChatEventMessageCompleteMsg(
                "Sorry. After examining relevant data files, I didn't find any useful information related to your inquiry."
            )
        );
        return null;
    }
    const table = markdownTable([
        Object.keys(records[0]),
        ...records.map((item) => Object.values(item).map((item) => `${item}`))
    ]);
    return `I found the following information might be related to your inquiry:\n ${table}`;
}

export async function createQueryDataFilesWithSQLQueryTool(
    input: ChainInput,
    distItems: {
        idx: number;
        dist: ParsedDistribution;
    }[]
): Promise<WebLLMTool> {
    const fileDescItems: string[] = [];
    for (let i = 0; i < distItems.length; i++) {
        const idx = distItems[i].idx;
        const title = distItems[i].dist.title;
        const columns = (await getDistColumnNames(idx))?.filter(
            (item) => !!item
        );
        if (!columns?.length) {
            continue;
        }
        const fileDesc = toYaml({
            id: idx,
            title,
            columns
        });
        fileDescItems.push(fileDesc);
    }
    return {
        name: "queryDataFilesWithSQLQuery",
        func: queryDataFilesWithSQLQuery,
        description:
            "This tool can execute a single SQL query against a list of available data files and return the results in order to answer the user inquiry.\n" +
            "Below is the list of available data files:\n" +
            fileDescItems.join("\n"),
        parameters: [
            {
                name: "sqlQuery",
                type: "string" as const,
                description:
                    "the SQL query to be executed. " +
                    "In the provided SQL query, you can reference a data file as a table using the custom SQL function source(dataFileIndexNumber).\n" +
                    "- The dataFileIndexNumber parameter represents the index number of the data file in the list.\n" +
                    "- For example, to query the data file with index 2, you can supply the SQL query: SELECT * FROM source(2)\n" +
                    "Here, the dataFileIndexNumber parameter is the data file index number.\n" +
                    "e.g. To query the data file with index 2, you can supply a SQL query: SELECT * FROM source(2)"
            }
        ],
        requiredParameters: ["sqlQuery"]
    };
}
