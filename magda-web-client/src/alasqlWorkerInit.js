importScripts("xlsx.core.min.0.19.3.js", "alasql.min.4.5.1.js");
let isInitDone = false;
global.onmessage = function (event) {
    try {
        if (event.data.type !== "startInit") {
            // only process startInit event here
            return;
        }
        if (isInitDone) {
            throw new Error(
                "Alasql worker receives `startInit` event after initialisation is completed."
            );
        }
        global.magda_server_config = event.data.config;
        const commonFetchRequestOptions =
            event.data.config.commonFetchRequestOptions;
        import("./libs/sqlUtils.ts").then((sqlUtils) => {
            const { source, setCurrentDistList, setCurrentDist } = sqlUtils;
            /**
             * From https://github.com/AlaSQL/alasql/blob/9ea01ac44b033d7c0e9bc5ddecca70638ed95c60/src/15utility.js
             * MIT license
             * @param {*} s
             * @return {*}
             */
            function cutbom(s) {
                if (s[0] === String.fromCharCode(65279)) {
                    s = s.substr(1);
                }
                return s;
            }

            async function fetchData(path, success, error, async) {
                if (async) {
                    return getData(path, success, error);
                }
                return await getData(path, success, error);
            }

            const defaultCommonFetchRequestOptions = {
                credentials: "same-origin"
            };

            function getData(path, binary, success, error) {
                if (binary) {
                    return fetch(path, {
                        ...defaultCommonFetchRequestOptions,
                        ...(commonFetchRequestOptions
                            ? commonFetchRequestOptions
                            : {})
                    })
                        .then((response) => response.arrayBuffer())
                        .then(success)
                        .catch((e) => {
                            if (error) return error(e);
                            console.error(e);
                            throw e;
                        });
                } else {
                    return fetch(path, {
                        ...defaultCommonFetchRequestOptions,
                        ...(commonFetchRequestOptions
                            ? commonFetchRequestOptions
                            : {})
                    })
                        .then((response) => response.text())
                        .then(success)
                        .catch((e) => {
                            if (error) return error(e);
                            console.error(e);
                            throw e;
                        });
                }
            }

            alasql.utils.loadFile = function (path, asy, success, error) {
                /*
                SELECT * FROM TXT('#one') -- read data from HTML element with id="one"
            */
                if (
                    path.substring(0, 1) === "#" &&
                    typeof document !== "undefined"
                ) {
                    const data = document.querySelector(path).textContent;
                    success(data);
                    return;
                }
                /*
                Simply read file from HTTP request, like:
                SELECT * FROM TXT('http://alasql.org/README.md');
            */
                fetchData(path, false, (x) => success(cutbom(x)), error, asy);
            };

            alasql.utils.loadBinaryFile = function (
                path,
                runAsync,
                success,
                error = (x) => {
                    throw x;
                }
            ) {
                if (typeof path === "string") {
                    fetchData(path, true, success, error, runAsync);
                } else if (path instanceof Blob) {
                    success(path);
                } else {
                    throw new Error(
                        "invalid path type is provided to alasql.loadBinaryFile"
                    );
                }
            };

            alasql.setXLSX(XLSX);
            alasql.from.source = source;
            alasql.from.SOURCE = source;

            global.onmessage = function (event) {
                try {
                    switch (event.data.type) {
                        case "setCurrentDistList":
                            setCurrentDistList(event.data.data);
                            break;
                        case "setCurrentDist":
                            setCurrentDist(event.data.data);
                            break;
                        default:
                            alasql(event.data.sql, event.data.params, function (
                                data,
                                err
                            ) {
                                postMessage({
                                    id: event.data.id,
                                    data: data,
                                    error: err
                                });
                            });
                    }
                } catch (e) {
                    postMessage({
                        id: event.data.id,
                        data: undefined,
                        error: e
                    });
                }
            };

            postMessage({
                type: "initialized"
            });

            isInitDone = true;
        });
    } catch (e) {
        postMessage({
            id: event.data.id,
            data: undefined,
            error: e
        });
    }
};
