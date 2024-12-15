(function initialization() {
    function setupWorker(magdaConfig, cb) {
        alasql.webworker = new Worker("./libs/alasqlWorkerInit.min.js");
        alasql.webworker.onmessage = function (event) {
            if (
                event.data &&
                event.data.type === "initialized" &&
                typeof cb === "function"
            ) {
                cb(alasql.webworker);
                return;
            }
            const id = event.data.id;
            alasql.buffer[id](event.data.data, event.data.error);
            delete alasql.buffer[id];
        };
        alasql.webworker.onerror = function (e) {
            throw e;
        };
        alasql.webworker.postMessage({
            type: "startInit",
            config: magdaConfig
        });
    }
    const urlInfo = URL.parse(window.location.href);
    const refToken = urlInfo.searchParams.get("refToken");
    if (!refToken) {
        throw new Error(
            "Failed to initialize AlaSQL: cannot location refToken"
        );
    }
    // client config should be passed into web worker via `onAlaSQLIframeLoaded` callback
    setupWorker(
        window.parent[`alasqlMagdaConfig${refToken}`],
        window.parent[`onAlaSQLIframeLoaded${refToken}`]
    );
})();
