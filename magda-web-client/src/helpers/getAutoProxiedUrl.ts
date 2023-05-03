import { config } from "../config";
import fetch from "isomorphic-fetch";
import urijs from "urijs";

interface ServerConfig {
    proxyAllDomains: boolean;
    version: string;
    allowProxyFor: string[];
}

let serverConfigPromise: Promise<ServerConfig> | null = null;

export default async function getAutoProxiedUrl(
    url: string,
    cachePeriod: string = "1d"
): Promise<string> {
    const { proxyUrl } = config;

    if (!serverConfigPromise) {
        serverConfigPromise = fetch(
            `${proxyUrl.replace(/proxy\/$/, "")}serverconfig/`
        ).then((res) => res.json() as Promise<ServerConfig>);
    }

    const serverConfig = await serverConfigPromise;

    if (serverConfig?.proxyAllDomains || !serverConfig?.allowProxyFor?.length) {
        return url;
    }

    const urlHostname = urijs(url).hostname().toLowerCase();
    const proxyHostname = urijs(proxyUrl).hostname().toLowerCase();
    if (urlHostname === proxyHostname) {
        return url;
    }

    if (
        serverConfig.allowProxyFor.findIndex((domainStr) => {
            const searchStr =
                domainStr.indexOf(".") === -1 ? `${domainStr}.` : domainStr;
            return urlHostname.indexOf(searchStr) !== -1;
        }) === -1
    ) {
        return url;
    } else {
        return `${proxyUrl}_${cachePeriod}/${url}`;
    }
}
