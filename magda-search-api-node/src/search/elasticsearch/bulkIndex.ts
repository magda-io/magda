import _ from "lodash";
import { Client } from "@elastic/elasticsearch";
import handleESError from "./handleESError";

export default async function bulkIndex(
    client: Client,
    indexId: string,
    documents: any[],
    refresh: boolean
): Promise<any> {
    const bulkCommands = _.flatMap(documents, dataset => [
        {
            index: {
                _index: indexId,
                _id: dataset.identifier,
                _type: indexId
            }
        },
        dataset
    ]);

    const result: any = await handleESError(
        client.bulk({
            body:
                bulkCommands
                    .map(command => JSON.stringify(command))
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
