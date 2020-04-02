import { config } from "config";
import request from "helpers/request";

export async function listConnectors() {
    return request("GET", `${config.adminApiUrl}connectors`);
}

export async function startConnector(connectorId) {
    return request(
        "POST",
        `${config.adminApiUrl}connectors/${connectorId}/start`
    );
}

export async function stopConnector(connectorId) {
    return request(
        "POST",
        `${config.adminApiUrl}connectors/${connectorId}/stop`
    );
}

export async function deleteConnector(connectorId) {
    return request("DELETE", `${config.adminApiUrl}connectors/${connectorId}`);
}
