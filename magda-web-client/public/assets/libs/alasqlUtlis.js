/// <reference path="fetchWithCache.d.ts" />
(function initialization() {
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

    async function fetchData(path, success, error, async, binary) {
        if (async) {
            return getData(path, success, error, binary);
        }
        return await getData(path, success, error, binary);
    }

    const defaultCommonFetchRequestOptions = {
        credentials: "same-origin"
    };

    function formatSize(size) {
        const mb = Math.floor(size / 1024 / 1024);
        if (mb > 0) {
            return mb + "MB";
        }
        const kb = Math.floor(size / 1024);
        if (kb > 0) {
            return kb + "KB";
        }
        return size + " bytes";
    }

    function checkContentSizeLimit(data) {
        const sqlConsoleMaxFileSize =
            typeof window.sqlConsoleMaxFileSize === "number"
                ? window.sqlConsoleMaxFileSize
                : -1;
        if (sqlConsoleMaxFileSize < 0) {
            return data;
        }
        const size = typeof data === "string" ? data.length : data.byteLength;
        if (size > sqlConsoleMaxFileSize) {
            throw new Error(
                `Unable to process the data file as its size (${formatSize(
                    size
                )}) is beyond configured limit: ${formatSize(
                    sqlConsoleMaxFileSize
                )}`
            );
        }
        return data;
    }

    const SQL_CONSOLE_CACHE_NAME = "magda-sql-console";
    const SQL_CONSOLE_CACHE_MAX_SIZE = 10;
    const SQL_CONSOLE_CACHE_EXPIRATION = 86400; // - 1 day

    function getData(path, success, error, binary) {
        try {
            const req = new Request(path, {
                ...defaultCommonFetchRequestOptions,
                ...(window.commonFetchRequestOptions
                    ? window.commonFetchRequestOptions
                    : {})
            });
            const cacheCfg = {
                cacheName:
                    typeof window.sqlConsoleCacheName === "string"
                        ? window.sqlConsoleCacheName
                        : SQL_CONSOLE_CACHE_NAME,
                expiration:
                    typeof window.sqlConsoleCacheExpiration === "number"
                        ? window.sqlConsoleCacheExpiration
                        : SQL_CONSOLE_CACHE_EXPIRATION,
                maxCacheSize:
                    typeof window.sqlConsoleCacheMaxSize === "number"
                        ? window.sqlConsoleCacheMaxSize
                        : SQL_CONSOLE_CACHE_MAX_SIZE
            };
            const resPromise = fetchWithCache(req, cacheCfg);
            if (binary) {
                return resPromise
                    .then((response) => response.arrayBuffer())
                    .then((data) => checkContentSizeLimit(data))
                    .then(success)
                    .catch((e) => {
                        console.error(e);
                        if (error) return error(e);
                        throw e;
                    });
            } else {
                return resPromise
                    .then((response) => response.text())
                    .then((data) => checkContentSizeLimit(data))
                    .then(success)
                    .catch((e) => {
                        console.error(e);
                        if (error) return error(e);
                        throw e;
                    });
            }
        } catch (e) {
            console.error(e);
            if (error) return error(e);
            throw e;
        }
    }

    alasql.utils.loadFile = function (path, asy, success, error) {
        /*
            SELECT * FROM TXT('#one') -- read data from HTML element with id="one"
        */
        if (path.substring(0, 1) === "#" && typeof document !== "undefined") {
            const data = document.querySelector(path).textContent;
            success(data);
            return;
        }
        /*
            Simply read file from HTTP request, like:
            SELECT * FROM TXT('http://alasql.org/README.md');
        */
        fetchData(path, (x) => success(cutbom(x)), error, asy);
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
            fetchData(path, success, error, runAsync, true);
        } else if (path instanceof Blob) {
            success(path);
        } else {
            throw new Error(
                "invalid path type is provided to alasql.loadBinaryFile"
            );
        }
    };

    alasql.setXLSX(XLSX);
    const urlInfo = URL.parse(location.href);
    const refToken = urlInfo.searchParams.get("refToken");
    if (!refToken) {
        throw new Error(
            "Failed to initialise AlaSQL: cannot location refToken"
        );
    }
    const source = async (...args) => {
        await window.parent[`alasqlSourceFunc${refToken}`].apply(null, args);
    };
    alasql.from.source = source;
    alasql.from.SOURCE = source;
    window.parent[`onAlaSQLIframeLoaded${refToken}`]();
})();
