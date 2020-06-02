import { config } from "config";
import request from "helpers/request";

export async function getAuthProviders(): Promise<string[]> {
    const providers = await request("GET", `${config.baseUrl}auth/providers`);
    if (providers) {
        return providers;
    } else {
        return [];
    }
}
