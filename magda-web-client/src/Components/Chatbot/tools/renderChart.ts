import { createChatEventMessageCompleteMsg } from "../Messaging";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";

const renderChart: WebLLMTool = {
    name: "renderChart",
    func: async function (this: ChainInput, configJsonStr: string) {
        console.log("configJsonStr: ", configJsonStr);
        this.queue.push(
            createChatEventMessageCompleteMsg(
                "```echarts\n" + configJsonStr + "\n```\n"
            )
        );
    },
    description:
        "This tool takes echarts configuration JSON string as input, render and present the chart to the user.",
    parameters: [
        {
            name: "configJsonStr",
            type: "string" as const,
            description: "echarts configuration JSON string"
        }
    ],
    requiredParameters: ["configJsonStr"]
};

export default renderChart;
