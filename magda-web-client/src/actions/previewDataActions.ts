import { config } from "../config";
import fetch from "isomorphic-fetch";
import { actionTypes } from "../constants/ActionTypes";

export function requestPreviewData(url: string) {
    return {
        type: actionTypes.REQUEST_PREVIEW_DATA,
        url
    };
}

export function receivePreviewData(data: any) {
    return {
        type: actionTypes.RECEIVE_PREVIEW_DATA,
        previewData: data
    };
}

export function requestPreviewDataError(error: any) {
    return {
        type: actionTypes.REQUEST_PREVIEW_DATA_ERROR,
        error
    };
}

export function resetPreviewData() {
    return {
        type: actionTypes.RESET_PREVIEW_DATA
    };
}

function loadPapa() {
    return import(/* webpackChunkName: "papa" */ "papaparse")
        .then((papa) => {
            return papa;
        })
        .catch((error) => {
            console.error(
                "An error occurred while loading the component",
                error
            );
            throw error;
        });
}

function loadXmlParser() {
    return import(
        /* webpackChunkName: "xmltoTabular" */ "../helpers/xmlToTabular"
    )
        .then((xmlToTabular) => {
            return xmlToTabular;
        })
        .catch((error) => {
            console.error(
                "An error occurred while loading the component",
                error
            );
            throw error;
        });
}

function loadRssParser() {
    return import(/* webpackChunkName: "rssParser" */ "rss-parser")
        .then((rssParser) => {
            return rssParser;
        })
        .catch((error) => {
            console.error(
                "An error occurred while loading the component",
                error
            );
            throw error;
        });
}

export function fetchPreviewData(distribution) {
    return (dispatch: Function, getState: Function) => {
        if (
            getState().previewData.isFetching &&
            distribution.downloadURL === getState().previewData.url
        ) {
            return false;
        }

        const url = distribution.downloadURL;
        const format = distribution.format.toLowerCase();

        dispatch(requestPreviewData(url));

        const proxy = config.proxyUrl;

        switch (format) {
            case "csv-geo-au":
                loadPapa().then((papa) => {
                    papa.parse(proxy + "_0d/" + url, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: function (data) {
                            (data.meta as any).chartFields =
                                distribution.chartFields;
                            dispatch(
                                receivePreviewData({
                                    [distribution.identifier]: data
                                })
                            );
                        },
                        error: (error) => {
                            dispatch(requestPreviewDataError(error));
                        }
                    });
                });

                break;
            case "csv":
                loadPapa().then((papa) => {
                    papa.parse(proxy + "_0d/" + url, {
                        download: true,
                        header: true,
                        skipEmptyLines: true,
                        complete: function (data) {
                            (data.meta as any).chartFields =
                                distribution.chartFields;
                            dispatch(
                                receivePreviewData({
                                    [distribution.identifier]: data
                                })
                            );
                        },
                        error: (error) => {
                            dispatch(requestPreviewDataError(error));
                        }
                    });
                });

                break;
            case "xml":
                fetch(proxy + url, config.credentialsFetchOptions)
                    .then((response) => {
                        if (response.status !== 200) {
                            return dispatch(
                                requestPreviewDataError({
                                    title: response.status,
                                    detail: response.statusText
                                })
                            );
                        }
                        return response.text();
                    })
                    .then((xmlData) => {
                        loadXmlParser().then((xmlToTabular) => {
                            const data = xmlToTabular.default(xmlData);
                            if (data) {
                                dispatch(receivePreviewData(data));
                            } else {
                                dispatch(
                                    requestPreviewDataError(
                                        "failed to parse xml"
                                    )
                                );
                            }
                        });
                    });
                break;
            case "json":
                fetch(proxy + url, config.credentialsFetchOptions)
                    .then((response) => {
                        if (response.status !== 200) {
                            return dispatch(
                                requestPreviewDataError({
                                    title: response.status,
                                    detail: response.statusText
                                })
                            );
                        }
                        return response.json();
                    })
                    .then((json) => {
                        const jsonData = {
                            data: json,
                            meta: {
                                type: "json"
                            }
                        };
                        if (!json.error) {
                            dispatch(
                                receivePreviewData({
                                    [distribution.identifier]: jsonData
                                })
                            );
                        } else {
                            dispatch(
                                requestPreviewDataError("failed to parse json")
                            );
                        }
                    });
                break;

            case "txt":
                fetch(proxy + url, config.credentialsFetchOptions)
                    .then((response) => {
                        if (response.status !== 200) {
                            return dispatch(
                                requestPreviewDataError({
                                    title: response.status,
                                    detail: response.statusText
                                })
                            );
                        }
                        return response.text();
                    })
                    .then((text) => {
                        const textData = {
                            data: text,
                            meta: {
                                type: "txt"
                            }
                        };
                        dispatch(
                            receivePreviewData({
                                [distribution.identifier]: textData
                            })
                        );
                    });
                break;
            case "html":
                const htmlData = {
                    data: url,
                    meta: {
                        type: "html"
                    }
                };
                dispatch(
                    receivePreviewData({ [distribution.identifier]: htmlData })
                );
                break;
            case "googleViewable":
                const googleViewableData = {
                    data: url,
                    meta: {
                        type: "googleViewable"
                    }
                };
                dispatch(
                    receivePreviewData({
                        [distribution.identifier]: googleViewableData
                    })
                );
                break;
            case "impossible":
                const impossibleData = {
                    data: url,
                    meta: {
                        type: "impossible"
                    }
                };
                dispatch(
                    receivePreviewData({
                        [distribution.identifier]: impossibleData
                    })
                );
                break;
            case "rss":
                fetch(proxy + url, config.credentialsFetchOptions)
                    .then((response) => {
                        if (response.status !== 200) {
                            return dispatch(
                                requestPreviewDataError({
                                    title: response.status,
                                    detail: response.statusText
                                })
                            );
                        } else {
                            return response.text();
                        }
                    })
                    .then((text) => {
                        loadRssParser().then((rssParser) => {
                            rssParser.parseString(text, (err, result) => {
                                if (err) {
                                    dispatch(
                                        requestPreviewDataError(
                                            "error getting rss feed"
                                        )
                                    );
                                    console.warn(err);
                                } else {
                                    dispatch(
                                        receivePreviewData({
                                            data: result.feed.entries,
                                            meta: {
                                                type: "rss"
                                            }
                                        })
                                    );
                                }
                            });
                        });
                    });
                break;
            default:
                return dispatch(
                    receivePreviewData({ [distribution.identifier]: null })
                );
        }
    };
}
