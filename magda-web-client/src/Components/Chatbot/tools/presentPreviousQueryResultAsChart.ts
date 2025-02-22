import { createChatEventMessageCompleteMsg } from "../Messaging";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";
import renderChart from "./renderChart";
import { markdownTable } from "markdown-table";

const presentPreviousQueryResultAsChart: WebLLMTool = {
    name: "presentPreviousQueryResultAsChart",
    func: async function (this: ChainInput) {
        if (!this.keyContextData?.queryResult) {
            this.queue.push(
                createChatEventMessageCompleteMsg(
                    `Sorry. I attempted to generate visualization based on previous query result but can't locate any previous query result.`
                )
            );
            return;
        }
        const records = this.keyContextData.queryResult;
        const table = markdownTable([
            Object.keys(records[0]),
            ...records.map((item) =>
                Object.values(item).map((item) => `${item}`)
            )
        ]);
        await this.model.invokeTool(
            `Please present the provided user data below in the most suitable chart visualization:\n ${table}`,
            [renderChart],
            this
        );
    },
    description:
        "This tool can generate appropriate chart presentation based on the previous query result."
};

export async function createPresentPreviousQueryResultAsChartTool(
    input: ChainInput
): Promise<WebLLMTool | null> {
    if (input?.keyContextData?.queryResult) {
        return presentPreviousQueryResultAsChart;
    } else {
        return null;
    }
}

export default presentPreviousQueryResultAsChart;
