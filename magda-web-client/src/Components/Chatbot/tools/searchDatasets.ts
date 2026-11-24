import { getRecordAspect } from "api-clients/RegistryApis";
import {
    search as semanticSearch,
    retrieve as semanticRetrieve,
    SearchResultItem
} from "api-clients/SemanticSearchApis";
import { createChatEventMessageCompleteMsg } from "../Messaging";
import { markdownTable } from "markdown-table";
import { config } from "../../../config";
import { ChainInput } from "../commons";
import { WebLLMTool } from "../ChatWebLLM";

const MAX_DESC_DISPLAY_LENGTH = 250;
const MAX_CHUNK_DISPLAY_LENGTH = 500;
const OVERFETCH_FACTOR = 5;
const { uiBaseUrl } = config;

async function retrieveDatasets(
    question: string,
    limit: number = 3,
    fileTypes?: string
) {
    const notFound =
        "Sorry, I didn't find any datasets related to your inquiry.";
    if (!question) {
        return notFound;
    }

    // 1) semantci search, get top-N results
    // Setting OVERFETCH_FACTOR to get more results in case some result are from the same dataset
    const searchResult: SearchResultItem[] = await semanticSearch(
        {
            query: question,
            max_num_results: limit * OVERFETCH_FACTOR,
            fileFormat: fileTypes?.toUpperCase()
        },
        "POST"
    );
    if (!searchResult?.length) {
        return notFound;
    }

    const bestByRecord = new Map<string, SearchResultItem>();
    for (const item of searchResult) {
        const key = item.recordId;
        if (!key) continue;
        const prev = bestByRecord.get(key);
        if (!prev || (item.score ?? 0) > (prev.score ?? 0)) {
            bestByRecord.set(key, item);
        }
    }

    const result = Array.from(bestByRecord.values())
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
        .slice(0, limit);

    if (!result.length) return notFound;

    // 2) fetch metadata (title/description) from registry
    const recordIds = Array.from(
        new Set(result.map((r) => r.recordId).filter(Boolean))
    ).slice(0, limit);

    const recordMap = new Map<string, any>();
    await Promise.all(
        recordIds.map(async (id) => {
            try {
                const searchItem = result.find((item) => item.recordId === id);
                const recordIdToUse = searchItem?.parentRecordId || id;

                const record = await getRecordAspect(
                    recordIdToUse,
                    "dcat-dataset-strings",
                    true
                );
                recordMap.set(id, record);
            } catch {
                // pass
            }
        })
    );

    // 3) Title / Description
    const datasets = await Promise.all(
        result.map(async (item) => {
            const datasetRecordId = item.recordId;
            const dcat = recordMap.get(datasetRecordId);

            const titleText = dcat?.title || datasetRecordId;
            const descSrc = dcat?.description || item.text || "";
            const desc = truncateText(descSrc, MAX_DESC_DISPLAY_LENGTH);

            const datasetId = encodeURIComponent(
                encodeURIComponent(datasetRecordId)
            );
            const title = `[${titleText}](${
                uiBaseUrl === "/"
                    ? `/dataset/${datasetId}`
                    : `${uiBaseUrl}/dataset/${datasetId}`
            })`;

            let chunkText = item.text;
            if (item.fileFormat?.toUpperCase().includes("CSV")) {
                try {
                    // retrieve the full text of the chunk to get all the column names
                    const retrieveResult = await semanticRetrieve({
                        ids: [item.id],
                        mode: "full"
                    });
                    let columnNames: string[] = [];
                    if (retrieveResult && retrieveResult.length > 0) {
                        const fullText = retrieveResult[0].text;
                        columnNames = getColumnNames(fullText);
                    } else {
                        columnNames = getColumnNames(item.text);
                    }
                    chunkText = renderColumns(columnNames);
                } catch (error) {
                    // if error, use the original chunk text
                    const columnNames = getColumnNames(item.text);
                    chunkText = renderColumns(columnNames);
                }
            } else if (item.fileFormat?.toUpperCase().includes("PDF")) {
                chunkText = item.text;
            } else {
                chunkText = item.text;
            }

            chunkText = truncateText(chunkText, MAX_CHUNK_DISPLAY_LENGTH);

            return [title, deleteNewLine(desc), deleteNewLine(chunkText)];
        })
    );

    const table = markdownTable([
        ["Title", "Description", "Data Preview"],
        ...datasets
    ]);
    return `I found the following datasets might be related to your inquiry:\n ${table}`;
}

const deleteNewLine = (text: string) => {
    return text.replace(/\n|\r|<br\s*\/>/g, " ");
};

const getColumnNames = (text: string): string[] => {
    return text
        .split("Column names:")[1]
        .trim()
        .split("-")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
};

const renderColumns = (cols: string[], limit = 10): string => {
    if (!cols.length) return "-";
    const wrap = (x: string) => "`" + x + "`";
    if (cols.length <= limit) return cols.map(wrap).join(", ");
    const first = cols.slice(0, limit).map(wrap).join(", ");
    const more = cols.length - limit;
    return `${first} … (+${more} more)`;
};

const truncateText = (
    text: string,
    maxLength: number = MAX_CHUNK_DISPLAY_LENGTH
): string => {
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + "...";
    }
    return text;
};

const searchDatasets: WebLLMTool = {
    name: "searchDatasets",
    func: async function (
        queryString: string,
        limit: number = 5,
        fileTypes?: string
    ) {
        const context = (this as unknown) as ChainInput;
        const { queue } = context;
        queue.push(createChatEventMessageCompleteMsg("Searching datasets..."));
        return await retrieveDatasets(queryString, limit, fileTypes);
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
        },
        {
            name: "fileFormat",
            type: "string" as const,
            description:
                "Optional file format to filter results. Current supported file formats are 'CSV' and 'PDF'. If not specified, all file formats will be included."
        }
    ],
    requiredParameters: ["queryString"]
};

export default searchDatasets;
