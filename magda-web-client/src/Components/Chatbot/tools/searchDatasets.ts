import { searchDatasets as searchDatasetsApi } from "api-clients/SearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { config } from "../../../config";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";

const MAX_DESC_DISPLAY_LENGTH = 250;
const { uiBaseUrl } = config;

async function retrieveDatasets(question: string, limit: number = 5) {
    const notFound =
        "Sorry, I didn't find any datasets related to your inquiry.";
    if (!question) {
        return notFound;
    }
    const result = await searchDatasetsApi({ q: question, limit });
    if (!result?.dataSets?.length) {
        return notFound;
    }
    const datasets = result.dataSets.map((item) => {
        const desc = (item?.description?.length > MAX_DESC_DISPLAY_LENGTH
            ? item.description.substring(0, MAX_DESC_DISPLAY_LENGTH + 1) + "..."
            : item.description
        ).replace(/\n|\r|<br\s*\/>/g, " ");
        const datasetId = encodeURIComponent(
            encodeURIComponent(item.identifier)
        );
        const title = `[${item.title}](${
            uiBaseUrl === "/"
                ? `/dataset/${datasetId}`
                : `${uiBaseUrl}/dataset/${datasetId}`
        })`;
        return [title, desc];
    });

    const table = markdownTable([["Title", "Description"], ...datasets]);
    return `I found the following datasets might be related to your inquiry:\n ${table}`;
}

const searchDatasets: WebLLMTool = {
    name: "searchDatasets",
    func: async function (queryString: string) {
        const context = (this as unknown) as ChainInput;
        const { queue } = context;
        queue.push(createChatEventMessageCompleteMsg("Searching datasets..."));
        return await retrieveDatasets(queryString);
    },
    description:
        "This tool can be used to search datasets relevant to the user's inquiry and present the dataset list to user as the answer. You must use this call when there is no better tool to use." +
        "You should generate one or more keywords or a sentence on the user inquiry and supply as the compulsory `queryString` parameter.",
    parameters: [
        {
            name: "queryString",
            type: "string" as const,
            description:
                "a query string used to search relevant datasets. Can be one or more keywords (separated by space). Must be a non-empty string."
        },
        {
            name: "limit",
            type: "number" as const,
            description:
                "The max. number of datasets that you want to return. This is not a compulsory parameter. Default value is 5."
        }
    ],
    requiredParameters: ["queryString"]
};

export default searchDatasets;
