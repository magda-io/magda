import { config } from "config";
import request from "helpers/request";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";

export async function getAuthProviders(): Promise<string[]> {
    const providers = await request("GET", `${config.baseUrl}auth/providers`);
    if (providers) {
        return providers;
    } else {
        return [];
    }
}

export async function getAuthPlugins(): Promise<AuthPluginConfig[]> {
    const plugins = await request("GET", `${config.baseUrl}auth/plugins`);
    if (plugins) {
        return plugins;
    } else {
        return [];
    }
}
