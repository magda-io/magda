import { config } from "config";
import request from "helpers/request";
import { Publisher } from "helpers/record";

export function createPublisher(inputRecord: Publisher) {
    return createRecord(inputRecord);
}

export function fetchOrganization(publisherId: string): Promise<Publisher> {
    let url: string =
        config.registryReadOnlyApiUrl +
        `records/${encodeURIComponent(
            publisherId
        )}?aspect=organization-details`;

    return fetch(url, config.fetchOptions).then(response => {
        if (!response.ok) {
            let statusText = response.statusText;
            // response.statusText are different in different browser, therefore we unify them here
            if (response.status === 404) {
                statusText = "Not Found";
            }
            throw Error(statusText);
        }
        return response.json();
    });
}

type Record = {
    id: string;
    name: string;
    aspects: { [aspectId: string]: any };
};

function createRecord(inputRecord: Record) {
    return request(
        "POST",
        `${config.baseUrl}api/v0/registry/records`,
        inputRecord
    );
}
