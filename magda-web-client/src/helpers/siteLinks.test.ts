import {
    getFooterLinkProps,
    isBackendPath,
    isExternalUrl,
    opensInCurrentWindow
} from "./siteLinks";

describe("isBackendPath", () => {
    it("matches API & auth paths, with or without a prefix path", () => {
        expect(isBackendPath("/api/v0/apidocs/index.html")).toBe(true);
        expect(isBackendPath("/auth/login/oauth")).toBe(true);
        expect(isBackendPath("/magda/api/v0/registry/records")).toBe(true);
        expect(isBackendPath("/API/v0/x")).toBe(true);
    });

    it("doesn't match UI routes", () => {
        expect(isBackendPath("/page/about")).toBe(false);
        expect(isBackendPath("/search?q=api")).toBe(false);
        expect(isBackendPath("/api")).toBe(false);
        expect(isBackendPath("https://example.com/api/x")).toBe(false);
    });
});

describe("isExternalUrl & opensInCurrentWindow", () => {
    it("detects full URLs", () => {
        expect(isExternalUrl("https://magda.io")).toBe(true);
        expect(isExternalUrl("http://x.com/a")).toBe(true);
        expect(isExternalUrl("/page/about")).toBe(false);
        expect(isExternalUrl("page/https://x")).toBe(false);
    });

    it("tells whether a target opens in the current window", () => {
        expect(opensInCurrentWindow(undefined)).toBe(true);
        expect(opensInCurrentWindow("_self")).toBe(true);
        expect(opensInCurrentWindow("_blank")).toBe(false);
        expect(opensInCurrentWindow("_top")).toBe(false);
    });
});

describe("getFooterLinkProps", () => {
    it("opens full URLs in a new window by default", () => {
        expect(getFooterLinkProps({ href: "https://magda.io" })).toEqual({
            href: "https://magda.io",
            target: "_blank",
            rel: "noopener noreferrer",
            fullPageLoad: false
        });
    });

    it("opens backend paths in a new window by default", () => {
        expect(
            getFooterLinkProps({ href: "/api/v0/apidocs/index.html" })
        ).toEqual({
            href: "/api/v0/apidocs/index.html",
            target: "_blank",
            rel: "noopener noreferrer",
            fullPageLoad: false
        });
    });

    it("opens other site paths in the same window by default", () => {
        expect(getFooterLinkProps({ href: "/page/about" })).toEqual({
            href: "/page/about",
            target: undefined,
            rel: undefined,
            fullPageLoad: false
        });
        // a path without the leading `/` is relative to the site root
        expect(getFooterLinkProps({ href: "page/privacy policy" })).toEqual({
            href: "/page/privacy%20policy",
            target: undefined,
            rel: undefined,
            fullPageLoad: false
        });
    });

    it("uses the saved target & rel", () => {
        expect(
            getFooterLinkProps({ href: "/page/about", target: "_blank" })
        ).toEqual({
            href: "/page/about",
            target: "_blank",
            rel: "noopener noreferrer",
            fullPageLoad: false
        });
        expect(
            getFooterLinkProps({
                href: "https://magda.io",
                target: "_self",
                rel: "nofollow"
            })
        ).toEqual({
            href: "https://magda.io",
            target: "_self",
            rel: "nofollow",
            fullPageLoad: false
        });
    });

    it("loads backend paths opening in the same window as a full page", () => {
        expect(
            getFooterLinkProps({
                href: "/api/v0/apidocs/index.html",
                target: "_self"
            })
        ).toEqual({
            href: "/api/v0/apidocs/index.html",
            target: "_self",
            rel: undefined,
            fullPageLoad: true
        });
    });
});
