import { togglePreviewBanner } from "../actions/previewBanner";
import { config } from "../config";

const noop = () => {};
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

class popup {
    constructor(src, options) {
        //this.popupName =
    }

    open() {}
}

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

    getRecord(matchFunc) {
        if (!matchFunc) throw new Error("`matchFunc` cannot be empty!");
        const type = typeof matchFunc;
        if (type === "string") {
            matchFunc = record => record.id === matchFunc;
        } else if (type !== "function") {
            throw new Error(`\`matchFunc\` cannot be \`${type}\``);
        }
        return this.data.find(record => matchFunc(record));
    }

    setRecord(matchFunc, record) {
        if (!matchFunc) throw new Error("`matchFunc` cannot be empty!");
        const type = typeof matchFunc;
        if (type === "string") {
            matchFunc = record => record.id === matchFunc;
        } else if (type !== "function") {
            throw new Error(`\`matchFunc\` cannot be \`${type}\``);
        }
        this.data = this.data.map(orgRecord => {
            if (matchFunc(record) === true) {
                return record;
            } else {
                return orgRecord;
            }
        });
    }
}

const isUIPreviewerTargetInitiated = false;

export class UIPreviewerTarget {
    constructor(store) {
        if (isUIPreviewerTargetInitiated) {
            throw new Error(
                "You can only create one `UIPreviewerTarget` instance."
            );
        }
        this.store = store;
        this.targetRegisterMethod =
            typeof window["__magdaPreviewerTargetRegister"] === "function"
                ? target => {
                      this.initTarget();
                      window["__magdaPreviewerTargetRegister"](target);
                  }
                : noop;
    }

    register() {
        this.targetRegisterMethod(this);
    }

    initTarget() {
        this.interceptFetch();
        this.store.dispatch(togglePreviewBanner());
    }

    interceptFetch() {
        const orgFetchApi = window.fetch;
        window.fetch = (url, opts) => {
            if (
                typeof url !== "string" ||
                url.indexOf(config.contentApiURL) !== 0
            ) {
                return orgFetchApi(url, opts);
            }
        };
    }
}
