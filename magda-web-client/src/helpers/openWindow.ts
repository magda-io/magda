/**
    Modified from https://github.com/bartlomiejzuber/use-open-window
    MIT License

    Copyright (c) 2020 Bartłomiej

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.

    THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
    IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
    FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
    AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
    LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
    OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
    SOFTWARE.
 */
import reportError from "./reportError";

function calculateCenterPoint(targetWidth: number, targetHeight: number) {
    const screenX = window.screenX || window.screenLeft;
    const screenY = window.screenY || window.screenTop;
    const outerWidth =
        window.outerWidth || document.documentElement.clientWidth;
    const outerHeight =
        window.outerHeight || document.documentElement.clientHeight;

    const left = screenX + (outerWidth - targetWidth) / 2;
    const top = screenY + (outerHeight - targetHeight) / 2;

    return {
        left,
        top
    };
}

function windowOptionsMapper(object: object) {
    const options = Object.entries(object).map(
        ([key, value]) => `${key}=${value}`
    );
    return options.join(",");
}

export type SpecsOption = "yes" | "no" | 1 | 0;

export type WithUrl = {
    /**
     * A DOMString indicating the URL of the resource to be loaded.
     * This can be a path or URL to an HTML page, image file, or any other resource that is supported by the browser.
     * If the empty string ("") is specified as url, a blank page is opened into the targeted browsing context.
     */
    url: string;
};

export interface UseOpenInWindowOptions {
    /* Specifies the target attribute or the name of the window. The following values are supported:
  _blank - URL is loaded into a new window, or tab. This is default
  _parent - URL is loaded into the parent frame
  _self - URL replaces the current page
  _top - URL replaces any framesets that may be loaded
  name - The name of the window (Note: the name does not specify the title of the new window)
  */
    name?: "_blank" | "_parent" | "_self" | "_top" | string;
    /* specifies if window should be centered, default true */
    centered?: boolean;
    /* put window in focus, default true */
    focus?: boolean;
    onBlocked?: () => void;
    /* Optional. A comma-separated list of items, no whitespaces. */
    specs?: {
        /* The height of the window. Min. value is 100, default is 800*/
        height: number;
        /* The width of the window. Min. value is 100, default is 800*/
        width: number;
        /* The left position of the window. Negative values not allowed */
        left?: number;
        /* The top position of the window. Negative values not allowed */
        top?: number;
        /* Whether or not to display the window in theater mode. Default is no. IE only */
        channelmode?: SpecsOption;
        directories?: SpecsOption;
        /* Whether or not to display the browser in full-screen mode. Default is no. A window in full-screen mode must also be in theater mode. IE only */
        fullscreen?: SpecsOption;
        /* Whether or not to display the address field. Opera only */
        location?: SpecsOption;
        /*	Whether or not to display the menu bar */
        menubar?: SpecsOption;
        /*	Whether or not the window is resizable. IE only */
        resizable?: SpecsOption;
        /*	Whether or not to display scroll bars. IE, Firefox & Opera only */
        scrollbars?: SpecsOption;
        /*	Whether or not to add a status bar */
        status?: SpecsOption;
        /*	Whether or not to display the title bar. Ignored unless the calling application is an HTML Application or a trusted dialog box */
        titlebar?: SpecsOption;
        /*	Whether or not to display the browser toolbar. IE and Firefox only */
        toolbar?: SpecsOption;
    };
}

export type UseOpenInWindowOptionsWithUrl = UseOpenInWindowOptions & WithUrl;

export const defaultOptions: Required<UseOpenInWindowOptions> = {
    name: "_blank",
    centered: true,
    focus: true,
    // eslint-disable-next-line
    onBlocked: () =>
        reportError(
            "Cannot open popup window. Please disable popup blocker and try again."
        ),
    specs: {
        height: 900,
        width: 1400,
        scrollbars: "yes"
    }
};

function isBlocked(win: Window | null | undefined) {
    if (!win) {
        return false;
    } else if (win?.closed || typeof win.closed === "undefined") {
        return false;
    } else {
        return true;
    }
}

const getUrlAndOptions = (
    urlOrOptions: string | UseOpenInWindowOptionsWithUrl,
    optionsArg?: UseOpenInWindowOptions
) => {
    let url = "";
    let options = {};
    if (typeof urlOrOptions === "object") {
        url = urlOrOptions.url;
        options = urlOrOptions;
    } else {
        url = urlOrOptions;
        options = optionsArg || {};
    }

    return [url, options] as [string, UseOpenInWindowOptions];
};

function openWindow(
    urlOrOptions: string | UseOpenInWindowOptionsWithUrl,
    optionsArg?: UseOpenInWindowOptions
) {
    const [url, options] = getUrlAndOptions(urlOrOptions, optionsArg);
    const { specs } = options;
    const { specs: defaultSpecs } = defaultOptions;
    const mixedOptions = { ...defaultOptions, ...options };
    const mixedSpecs = { ...defaultSpecs, ...specs };

    const { focus, name, centered } = mixedOptions;
    let windowOptions = "";

    if (centered) {
        const { width, height, ...restSpecs } = mixedSpecs;
        const centerPoint = calculateCenterPoint(width, height);
        windowOptions = windowOptionsMapper({
            width,
            height,
            ...centerPoint,
            ...restSpecs
        });
    } else {
        windowOptions = windowOptionsMapper(mixedSpecs);
    }

    const newWindow = window.open(url, name, windowOptions);

    if (isBlocked(newWindow)) {
        if (typeof options?.onBlocked === "function") {
            console.log("is blocked...");
            options.onBlocked();
        }
        return null;
    }

    // Puts focus on the newWindow
    if (focus && newWindow) newWindow?.focus();

    return newWindow;
}

export default openWindow;
