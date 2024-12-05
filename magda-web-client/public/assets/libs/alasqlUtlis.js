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
                ...(window.commonFetchRequestOptions
                    ? window.commonFetchRequestOptions
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
                ...(window.commonFetchRequestOptions
                    ? window.commonFetchRequestOptions
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
        if (path.substring(0, 1) === "#" && typeof document !== "undefined") {
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
