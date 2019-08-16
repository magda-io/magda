import { config } from "config";
import request from "helpers/request";
import { Publisher } from "helpers/record";

export function createPublisher(inputRecord: Publisher) {
    return createRecord(inputRecord);
}

export function fetchOrganization(publisherId: string): Promise<Publisher> {
    let url: string =
        config.registryApiUrl +
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

export async function ensureAspectExists(id: string, jsonSchema: any) {
    await request(
        "PUT",
        `${config.baseUrl}api/v0/registry-auth/aspects/${id}`,
        {
            id,
            name: jsonSchema.title,
            jsonSchema
        }
    );
}

type Record = {
    id: string;
    name: string;
    aspects: { [aspectId: string]: any };
};

function createRecord(inputRecord: Record) {
    return request(
        "POST",
        `${config.baseUrl}api/v0/registry-auth/records`,
        inputRecord
    );
}
