import _ from "lodash";
import { Client } from "@elastic/elasticsearch";
import handleESError from "../../search/elasticsearch/handleESError.js";

/**
 * Adds an array of documents into the specified index
 */
export default async function bulkIndex(
    client: Client,
    indexId: string,
    documents: any[],
    refresh: boolean,
    idField: string
): Promise<any> {
    const bulkCommands = _.flatMap(documents, (document) => [
        {
            index: {
                _index: indexId,
                _id: document[idField],
                _type: indexId
            }
        },
        document
    ]);

    const result: any = await handleESError(
        client.bulk({
            body:
                bulkCommands
                    .map((command) => JSON.stringify(command))
                    .join("\n") + "\n",
            refresh: refresh ? "true" : "false"
        })
    );

    if (result.body.errors) {
        const itemsString = JSON.stringify(result.body.items, null, 2);
        console.error(itemsString);
        throw new Error(`Failed when bulk indexing: ${itemsString}`);
    }

    return result;
}
