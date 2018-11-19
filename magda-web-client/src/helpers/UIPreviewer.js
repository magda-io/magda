import { togglePreviewBanner } from "../actions/previewBanner";
import { config } from "../config";
import * as URI from "urijs";
import * as contentActions from "../actions/contentActions";
import * as staticPagesActions from "../actions/staticPagesActions";
import { Base64 } from "js-base64";
import * as isBase64 from "is-base64";
import i18n from "i18next";
import history from "../history";

const noop = () => {};

function refresh() {
    history.push({
        ...history.location,
        pathname: `/refresh${history.location.pathname}`
    });
}

const popupDefaultOptions = {
    width: 700,
    height: 520,
    menubar: "no",
    resizable: "yes",
    location: "yes",
    scrollbars: "no",
    toolbar: "no",
    directories: "no",
    status: "no",
    copyhistory: "no",
    centered: true
};

export class UIPreviewerManager {
    constructor() {
        this.previewTarget = null;
        this.previewWin = null;
        this.onTargetReady = noop;
    }

    openPreviewWindow(opts, onTargetReady) {
        this.onTargetReady = onTargetReady ? onTargetReady : noop;

        opts = opts || {};
        opts = { ...popupDefaultOptions, ...opts };

        // we try to place it at the center of the current window
        // note: this "centering" logic borrowed from the Facebook JavaScript SDK
        if (opts.centered) {
            let screenX =
                null == window.screenX ? window.screenLeft : window.screenX;
            let screenY =
                null == window.screenY ? window.screenTop : window.screenY;
            let outerWidth =
                null == window.outerWidth
                    ? document.documentElement.clientWidth
                    : window.outerWidth;
            let outerHeight =
                null == window.outerHeight
                    ? // 22= IE toolbar height
                      document.documentElement.clientHeight - 22
                    : window.outerHeight;

            if (null == opts.left)
                opts.left = parseInt(
                    screenX + (outerWidth - opts.width) / 2,
                    10
                );
            if (null == opts.top)
                opts.top = parseInt(
                    screenY + (outerHeight - opts.height) / 2.5,
                    10
                );
        }

        const nonStdOptKeys = ["name", "centered"];
        const optsStr = Object.keys(opts)
            .filter(key => nonStdOptKeys.indexOf(key) === -1)
            .map(key => `${key}=${opts.key}`)
            .join(",");

        let name = opts.name;
        if (!name)
            name = "popup-" + ((Math.random() * 0x10000000) | 0).toString(36);

        this.previewWin = window.open("/", name, optsStr);

        this.initPreviewTarget(this.previewWin);

        if (this.previewWin) {
            this.previewWin.focus();
        }

        return this.previewWin;
    }

    initPreviewTarget(winRef) {
        if (!winRef) return;
        winRef.__magdaPreviewerTargetRegister = target => {
            this.previewTarget = target;
            this.onTargetReady(target, this);
        };
    }
}
UIPreviewerManager.refresh = refresh;

class ContentStore {
    constructor() {
        this.data = [];
    }

    setData(data) {
        this.data = data;
    }

    getData() {
        return this.data;
    }

    getRecord(matchFuncOrId) {
        if (!matchFuncOrId) throw new Error("`matchFuncOrId` cannot be empty!");
        const type = typeof matchFuncOrId;
        let matchFunc;
        if (type === "string") {
            matchFunc = record => record.id === matchFuncOrId;
        } else if (type === "function") {
            matchFunc = matchFuncOrId;
        } else {
            throw new Error(`\`matchFunc\` cannot be \`${type}\``);
        }
        return this.data.find(record => matchFunc(record));
    }

    setRecord(record, matchFuncOrId) {
        if (!matchFuncOrId) {
            // --- by default, search record by record.id
            matchFuncOrId = record.id;
        }
        const type = typeof matchFuncOrId;
        let matchFunc;
        if (type === "string") {
            matchFunc = record => record.id === matchFuncOrId;
        } else if (type === "function") {
            matchFunc = matchFuncOrId;
        } else {
            throw new Error(`\`matchFunc\` cannot be \`${type}\``);
        }
        const idx = this.data.findIndex(record => matchFunc(record));
        if (idx === -1) {
            //--- if not item id exist, create a new entry
            this.data.push(record);
        } else {
            this.data[idx] = record;
        }
    }
}

class fetchResponsePolyfill {
    constructor(data, dataType = "json") {
        this.data = data;
        // --- possible values: "json", "text", "base64"
        this.dateType = dataType;
        this.status = 200;
        this.ok = true;
        this.statusText = "";
        this.type = "basic";
    }

    text() {
        if (this.dateType === "json") {
            return Promise.resolve(JSON.stringify(this.data));
        } else {
            return Promise.resolve(this.data);
        }
    }

    json() {
        if (this.dateType === "json") {
            return Promise.resolve(this.data);
        } else {
            return Promise.reject("Non json format");
        }
    }
}

let isUIPreviewerTargetInitialised = false;
let registeredUIPreviewerTarget = null;

export class UIPreviewerTarget {
    constructor(store) {
        if (isUIPreviewerTargetInitialised) {
            throw new Error(
                "You can only create one `UIPreviewerTarget` instance."
            );
        }
        isUIPreviewerTargetInitialised = true;
        this.actions = {
            contentActions,
            staticPagesActions
        };
        this.contentStore = new ContentStore();
        this.store = store;
        this.targetRegisterMethod =
            typeof window["__magdaPreviewerTargetRegister"] === "function"
                ? target => {
                      this.initTarget();
                      window["__magdaPreviewerTargetRegister"](target);
                  }
                : noop;
    }

    dispatch(action, ...args) {
        if (typeof action === "function") {
            //--- it's an action creator
            this.store.dispatch(action.apply(null, args));
        } else {
            this.store.dispatch(action);
        }
    }

    reloadLang() {
        i18n.reloadResources();
    }

    refreshPage() {
        refresh();
    }

    register() {
        this.targetRegisterMethod(this);
    }

    initTarget() {
        this.interceptFetch();
        this.store.dispatch(togglePreviewBanner());
        registeredUIPreviewerTarget = this;
    }

    interceptFetch() {
        const orgFetchApi = window.fetch;
        window.fetch = (url, opts) => {
            if (
                typeof url !== "string" ||
                url.indexOf(config.contentApiURL) !== 0 ||
                (opts &&
                    opts.method &&
                    String(opts.method).toLowerCase() !== "get")
            ) {
                return orgFetchApi(url, opts);
            }
            return this.queryContentStore(orgFetchApi, url, opts);
        };
    }

    async queryContentStore(orgFetchApi, url, opts) {
        try {
            const requestStr = "/" + url.replace(config.contentApiURL, "");
            const uri = new URI(requestStr.replace(/^\/+/, "/"));
            const query = uri.search(true);
            if (uri.segment(0) === "all") {
                const inline = query.inline === "true" ? true : false;
                const resData = this.contentStore.getData().map(item => {
                    const newItem = {
                        id: item.id,
                        type: item.type,
                        length: item.content.length
                    };
                    if (inline) {
                        if (
                            String(item.type).toLowerCase() ===
                            "application/json"
                        ) {
                            newItem.content = JSON.parse(item.content);
                        } else if (
                            item.type.toLowerCase().indexOf("text") !== -1
                        ) {
                            // --- text/* mime return content as well
                            newItem.content = item.content;
                        } else {
                            newItem.content = null;
                        }
                    }
                    return newItem;
                });
                if (!resData.length) {
                    return orgFetchApi(url, opts);
                }
                try {
                    // --- also query live content API to fill the gap
                    // --- i.e. if any items is not available from the local ContentStore
                    // --- we use the value from the live content API
                    // --- So that Previewer doesn't have to contain all content API items
                    const apiRes = await orgFetchApi(url, opts);
                    if (apiRes.status !== 200)
                        throw new Error(
                            `Failed to load data from content API. Status code: ${
                                apiRes.status
                            }`
                        );
                    const apiData = await apiRes.json();
                    if (apiData && apiData.length) {
                        apiData.forEach(item => {
                            if (
                                resData.findIndex(
                                    localItem => localItem.id === item.id
                                ) === -1
                            ) {
                                resData.push(item);
                            }
                        });
                    }
                } catch (e) {
                    console.log(e);
                }
                return Promise.resolve(new fetchResponsePolyfill(resData));
            } else {
                //--- other content api get calls
                const itemId = uri.pathname().replace(/^\//, "");
                const record = this.contentStore.getRecord(itemId);
                if (!record) {
                    return orgFetchApi(url, opts);
                }
                if (record.type === "application/json") {
                    return Promise.resolve(
                        new fetchResponsePolyfill(record.content)
                    );
                } else if (record.type.toLowerCase().indexOf("text") !== -1) {
                    return Promise.resolve(
                        new fetchResponsePolyfill(record.content, "text")
                    );
                } else {
                    return Promise.resolve(
                        new fetchResponsePolyfill(record.content, "base64")
                    );
                }
            }
        } catch (e) {
            return Promise.reject(e);
        }
    }
}

UIPreviewerTarget.convertContentUrl = url => {
    if (!registeredUIPreviewerTarget) {
        // --- is not in previewer mode or previewer not ready
        return url;
    }
    const requestStr = "/" + url.replace(config.contentApiURL, "");
    const uri = new URI(requestStr.replace(/^\/+/, "/"));
    const itemId = uri.pathname().replace(/^\/+/, "");
    let record = registeredUIPreviewerTarget.contentStore.getRecord(itemId);
    if (!record) {
        // --- search content item without extension name
        record = registeredUIPreviewerTarget.contentStore.getRecord(
            itemId.replace(/\.[^.]+$/, "")
        );
    }
    if (!record) {
        // --- cannot find in local store, will not try to produce inline url
        return url;
    }
    const uriHeader = `data:${record.type};base64,`;
    const data = isBase64(record.content)
        ? record.content
        : Base64.encode(record.content);
    return uriHeader + data;
};

UIPreviewerTarget.isActiveTarget = () => {
    return registeredUIPreviewerTarget != null;
};
