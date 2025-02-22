import { ChainInput, getLocationType } from "../commons";
import defaultAgent from "./defaultAgent";
import searchDatasets from "./searchDatasets";
import { createQueryDatasetTool } from "./queryDataset";
import { WebLLMTool } from "../ChatWebLLM";
import { createPresentPreviousQueryResultAsChartTool } from "./presentPreviousQueryResultAsChart";

async function createTools(input: ChainInput): Promise<WebLLMTool[]> {
    const type = getLocationType(input.location);
    switch (type) {
        case "DATASET_PAGE":
            return [
                await createQueryDatasetTool(input),
                await createPresentPreviousQueryResultAsChartTool(input),
                searchDatasets,
                defaultAgent
            ].filter((item) => !!item) as WebLLMTool[];
        case "DISTRIBUTION_PAGE":
            return [
                await createQueryDatasetTool(input),
                await createPresentPreviousQueryResultAsChartTool(input),
                searchDatasets,
                defaultAgent
            ].filter((item) => !!item) as WebLLMTool[];
        default:
            return [searchDatasets, defaultAgent];
    }
}

export default createTools;
