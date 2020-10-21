import { config } from "config";
import request from "helpers/request";
import { AuthPluginConfig } from "@magda/gateway/src/createAuthPluginRouter";
import urijs from "urijs";

export type AuthConfig =
    | {
          isAuthPlugin: false;
          config: string;
      }
    | {
          isAuthPlugin: true;
          config: AuthPluginConfig;
      };

export type QrCodeImgDataResponse = {
    token: string;
    data: string;
};

export type QrCodePollResponse = {
    result: "pending" | "success" | "failure";
    errorMessage: string;
};

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

export function convertAuthPluginApiUrl(
    pluginKey: string,
    apiUrl: string,
    optionalQueries?: { [key: string]: string }
): string {
    const uri = urijs(apiUrl);
    if (uri.protocol()) {
        // --- absolute url, return directly
        return apiUrl;
    } else {
        const baseUri = urijs(config.baseUrl);
        const query = uri.search(true);
        const apiUri = baseUri.segmentCoded(
            baseUri
                .segmentCoded()
                .concat(["auth", "login", "plugin", pluginKey])
                .concat(uri.segmentCoded())
        );

        return apiUri
            .search({
                ...(optionalQueries ? optionalQueries : {}),
                ...(query ? query : {})
            })
            .toString();
    }
}
