import isChrome from "./isChrome";

async function getChromeExtensionVersion(
    extensionId: string,
    name?: string
): Promise<boolean | string> {
    try {
        if (!isChrome()) {
            return false;
        }
        if (!(window as any)?.chrome?.runtime) {
            return false;
        }
        const chrome = (window as any).chrome;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => resolve(false), 500);
            const port = chrome.runtime.connect(
                extensionId,
                name ? { name } : undefined
            );
            const disconnectHandler = () => {
                resolve(false); // False if the connection was refused
                port.onDisconnect.removeListener(disconnectHandler);
            };
            port.onDisconnect.addListener(disconnectHandler);
            port.onMessage.addListener((msg) => {
                clearTimeout(timer);
                if (typeof msg?.version === "string") {
                    resolve(msg.version); // Extension is installed and responded
                } else {
                    resolve(false);
                }
            });
            port.postMessage("version");
        });
    } catch (e) {
        return false;
    }
}

export default getChromeExtensionVersion;
