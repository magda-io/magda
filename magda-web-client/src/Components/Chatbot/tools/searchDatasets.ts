import { searchDatasets as searchDatasetsApi } from "api-clients/SearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { config } from "../../../config";

const MAX_DESC_DISPLAY_LENGTH = 250;
const { uiBaseUrl } = config;

async function retrieveDatasets(question: string) {
    const notFound =
        "Sorry, I didn't find any datasets related to your inquiry.";
    if (!question) {
        return notFound;
    }
    const result = await searchDatasetsApi({ q: question, limit: 5 });
    if (!result?.dataSets?.length) {
        return notFound;
    }
    const datasets = result.dataSets.map((item) => {
        const desc = (item?.description?.length > MAX_DESC_DISPLAY_LENGTH
            ? item.description.substring(0, MAX_DESC_DISPLAY_LENGTH + 1) + "..."
            : item.description
        ).replaceAll("\n", "<br/>");
        const title = `[item.title](${
            uiBaseUrl === "/"
                ? `/datasets/${item.identifier}`
                : `${uiBaseUrl}/datasets/${item.identifier}`
        })`;
        return [title, desc];
    });

    const table = markdownTable([["Title", "Description"], ...datasets]);
    return `I found the following datasets might be related to your inquiry:\n ${table}`;
}

const searchDatasets = {
    name: "searchDatasets",
    func: async function (queryString: string) {
        const queue = (this as any).queue;
        queue.push(createChatEventMessageCompleteMsg("Searching datasets..."));
        return await retrieveDatasets(queryString);
    },
    description:
        "search and return datasets that are relevant to supplied `queryString`",
    parameters: [
        {
            name: "queryString",
            type: "string" as const,
            description: "a query string used to search relevant datasets."
        }
    ],
    requiredParameters: ["queryString"]
};

export default searchDatasets;
