import * as URI from "urijs";

// --- for domain without specified wait time,
// --- this default value (in second) will be used.
export let defaultDomainWaitTime = 1;
// --- record next access time (i.e. no request can be made before the time)
// --- for all domains (only create entries on domain access)
export let domainAccessTimeStore: any = {};

export function setDefaultDomainWaitTime(waitSeconds: number) {
    defaultDomainWaitTime = waitSeconds;
}

export function clearDomainAccessTimeStore() {
    domainAccessTimeStore = {};
}

export function getHostWaitTime(host: string, domainWaitTimeConfig: any) {
    if (
        domainWaitTimeConfig &&
        typeof domainWaitTimeConfig[host] === "number"
    ) {
        return domainWaitTimeConfig[host];
    }
    return defaultDomainWaitTime;
}

/**
 * For given url, return the required waitTime (in milliseconds) from now before the request can be sent.
 * This value can be used to set a timer to trigger the request at the later time.
 *
 * @param url String: the url that to be tested
 * @param domainWaitTimeConfig object: domainWaitTimeConfig
 */
export default function getUrlWaitTime(url: string, domainWaitTimeConfig: any) {
    const uri = new URI(url);
    const host = uri.hostname();
    const hostWaitTime = getHostWaitTime(host, domainWaitTimeConfig);
    const now = new Date().getTime();
    if (domainAccessTimeStore[host]) {
        if (domainAccessTimeStore[host] < now) {
            // --- allow to request now & need to set the new wait time
            domainAccessTimeStore[host] = now + hostWaitTime * 1000;
            return 0; //--- no need to wait
        } else {
            // --- need to wait
            const waitTime = domainAccessTimeStore[host] - now;
            // --- extends wait time for next possible request
            domainAccessTimeStore[host] += hostWaitTime * 1000;
            return waitTime;
        }
    } else {
        // --- first request && allow to request now
        domainAccessTimeStore[host] = now + hostWaitTime * 1000;
        return 0; //--- no need to wait
    }
}
