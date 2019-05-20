import _ from "lodash";
import { Client } from "@elastic/elasticsearch";
import handleESError from "./handleESError";

export default function bulkIndex(
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

    return handleESError(
        client.bulk({
            body:
                bulkCommands
                    .map(command => JSON.stringify(command))
                    .join("\n") + "\n",
            refresh: refresh ? "true" : "false"
        })
    );
}
