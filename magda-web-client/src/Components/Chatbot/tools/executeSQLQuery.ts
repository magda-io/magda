import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";
import { runQuery } from "../../../libs/sqlUtils";

const executeSQLQuery: WebLLMTool = {
    name: "executeSQLQuery",
    func: async function (this: ChainInput, sqlQuery: string) {
        this.queue.push(
            createChatEventMessageCompleteMsg("Executing queries...")
        );
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
            ...records.map((item) =>
                Object.values(item).map((item) => `${item}`)
            )
        ]);
        return `I found the following information might be related to your inquiry:\n ${table}`;
    },
    description: "execute the supplied SQL query and return the result",
    parameters: [
        {
            name: "sqlQuery",
            type: "string" as const,
            description: "the SQL query string to be executed"
        }
    ],
    requiredParameters: ["sqlQuery"]
};

export default executeSQLQuery;
