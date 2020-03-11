import { config } from "config";
import request from "helpers/request";
import { Publisher } from "helpers/record";
import { RawDataset } from "helpers/record";

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

export async function ensureAspectExists(id: string, jsonSchema: any) {
    await request("PUT", `${config.registryFullApiUrl}aspects/${id}`, {
        id,
        name: jsonSchema.title,
        jsonSchema
    });
}

export async function fetchDataset(id: string): Promise<RawDataset> {
    const parameters =
        "dereference=true&aspect=dcat-dataset-strings&optionalAspect=dcat-distribution-strings&optionalAspect=dataset-distributions&optionalAspect=temporal-coverage&" +
        "optionalAspect=usage&optionalAspect=access&optionalAspect=dataset-publisher&optionalAspect=source&optionalAspect=source-link-status&optionalAspect=dataset-quality-rating&" +
        "optionalAspect=spatial-coverage&optionalAspect=publishing&optionalAspect=dataset-access-control&optionalAspect=provenance&optionalAspect=information-security&optionalAspect=currency";
    const url =
        config.registryReadOnlyApiUrl +
        `records/${encodeURIComponent(id)}?${parameters}`;
    const response = await fetch(url, config.fetchOptions);
    if (!response.ok) {
        let statusText = response.statusText;
        // response.statusText are different in different browser, therefore we unify them here
        if (response.status === 404) {
            statusText = "Not Found";
        }
        throw Error(statusText);
    }
    const data = await response.json();
    if (data.records) {
        if (data.records.length > 0) {
            return data.records[0];
        } else {
            throw new Error("Not Found");
        }
    } else {
        return data;
    }
}

type Record = {
    id: string;
    name: string;
    aspects: { [aspectId: string]: any };
};

function createRecord(inputRecord: Record) {
    return request("POST", `${config.registryFullApiUrl}records`, inputRecord);
}
