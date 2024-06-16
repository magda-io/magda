import {
    CreateExtensionServiceWorkerMLCEngine,
    MLCEngineInterface,
    InitProgressReport,
    WebWorkerMLCEngine,
    MLCEngineConfig,
    ChatOptions
} from "@mlc-ai/web-llm";
import { ChatWorker } from "@mlc-ai/web-llm/lib/web_worker";

interface ExtensionMLCEngineConfig extends MLCEngineConfig {
    extensionId?: string;
    onDisconnect?: () => void;
}

const extensionId = "jjeiclacnkmkhaehifnoknfhbklffjeo";

class PortAdapter implements ChatWorker {
    port: chrome.runtime.Port;
    private _onmessage!: (message: any) => void;

    constructor(port: chrome.runtime.Port) {
        this.port = port;
        this.port.onMessage.addListener(this.handleMessage.bind(this));
        this.port.onDisconnect.addListener(function () {
            //Your logic
        });
    }

    // Wrapper to handle incoming messages and delegate to onmessage if available
    private handleMessage(message: any) {
        if (this._onmessage) {
            this._onmessage(message);
        }
    }

    // Getter and setter for onmessage to manage adding/removing listeners
    get onmessage(): (message: any) => void {
        return this._onmessage;
    }

    set onmessage(listener: (message: any) => void) {
        this._onmessage = listener;
    }

    // Wrap port.postMessage to maintain 'this' context
    postMessage = (message: any): void => {
        this.port.postMessage(message);
    };
}

export class ServiceWorkerMLCEngine extends WebWorkerMLCEngine {
    port: chrome.runtime.Port;
    extensionId?: string;

    constructor(engineConfig?: ExtensionMLCEngineConfig, keepAliveMs = 10000) {
        const extensionId = engineConfig?.extensionId;
        const onDisconnect = engineConfig?.onDisconnect;
        const port = extensionId
            ? chrome.runtime.connect(extensionId, {
                  name: "web_llm_service_worker"
              })
            : chrome.runtime.connect({ name: "web_llm_service_worker" });
        const chatWorker = new PortAdapter(port);
        super(chatWorker, engineConfig);
        this.port = port;
        this.extensionId = extensionId;

        // Keep alive through periodical heartbeat signals
        const keepAliveTimer = setInterval(() => {
            this.worker.postMessage({ kind: "keepAlive" });
        }, keepAliveMs);

        port.onDisconnect.addListener(() => {
            clearInterval(keepAliveTimer);
            if (onDisconnect) {
                onDisconnect();
            }
        });
    }
}

export async function CreateServiceWorkerMLCEngine(
    modelId: string,
    engineConfig?: ExtensionMLCEngineConfig,
    chatOpts?: ChatOptions,
    keepAliveMs = 10000
): Promise<ServiceWorkerMLCEngine> {
    const serviceWorkerMLCEngine = new ServiceWorkerMLCEngine(
        engineConfig,
        keepAliveMs
    );
    await serviceWorkerMLCEngine.reload(modelId, chatOpts);
    return serviceWorkerMLCEngine;
}

let loadingProcess: InitProgressReport = {
    progress: 0,
    timeElapsed: 0,
    text: ""
};

let enginePromise: Promise<MLCEngineInterface> | null = null;
let engine: MLCEngineInterface | null = null;
let onDisconnectCallbacks: (() => void)[] = [];

const initProgressCallback = (report: InitProgressReport) =>
    (loadingProcess = report);

export async function createEngine(onDisconnect?: () => void) {
    if (onDisconnect) {
        onDisconnectCallbacks.push(onDisconnect);
    }
    if (enginePromise) {
        return await enginePromise;
    } else {
        enginePromise = CreateServiceWorkerMLCEngine(
            "Mistral-7B-Instruct-v0.2-q4f16_1-MLC",
            {
                initProgressCallback: initProgressCallback,
                extensionId: extensionId,
                onDisconnect: () => {
                    enginePromise = null;
                    engine = null;
                    if (onDisconnectCallbacks?.length > 0) {
                        onDisconnectCallbacks.forEach((cb) => cb());
                        onDisconnectCallbacks = [];
                    }
                }
            }
        ).then((createdEngine) => (engine = createdEngine));
        // const keepAlivePort = chrome.runtime.connect(
        //     "jjeiclacnkmkhaehifnoknfhbklffjeo",
        //     { name: "keep_alive" }
        // );
        // setInterval(() => {
        //     keepAlivePort.postMessage({ kind: "keepAlive" });
        // }, 20000);
        return await enginePromise;
    }
}

export function getEngine() {
    return engine;
}

export function getLoadingProgress() {
    return loadingProcess;
}

window["createEngine"] = createEngine;
window["getEngine"] = getEngine;
window["getLoadingProgress"] = getLoadingProgress;
