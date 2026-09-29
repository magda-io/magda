import {
    getExternalTerriaMapTargetUrl,
    getFullMapTarget,
    getTargetOrigin
} from "./externalTerriaMap";

describe("getExternalTerriaMapTargetUrl", () => {
    it("returns undefined when no config is supplied", () => {
        expect(getExternalTerriaMapTargetUrl(undefined)).toBeUndefined();
    });

    it("returns undefined when the target URL is not set", () => {
        expect(getExternalTerriaMapTargetUrl({})).toBeUndefined();
    });

    it("returns undefined when the target URL is an empty or whitespace string", () => {
        expect(
            getExternalTerriaMapTargetUrl({
                openInExternalTerriaMapTargetUrl: ""
            })
        ).toBeUndefined();
        expect(
            getExternalTerriaMapTargetUrl({
                openInExternalTerriaMapTargetUrl: "   "
            })
        ).toBeUndefined();
    });

    it("returns the trimmed target URL when configured", () => {
        expect(
            getExternalTerriaMapTargetUrl({
                openInExternalTerriaMapTargetUrl: "https://terria.example.com/"
            })
        ).toBe("https://terria.example.com/");
        expect(
            getExternalTerriaMapTargetUrl({
                openInExternalTerriaMapTargetUrl:
                    "  https://terria.example.com/  "
            })
        ).toBe("https://terria.example.com/");
    });
});

describe("getFullMapTarget", () => {
    it("opens the built-in preview-map full view when no external URL is set", () => {
        expect(
            getFullMapTarget({ previewMapBaseUrl: "/preview-map/" })
        ).toEqual({ kind: "builtIn", url: "/preview-map/" });
        expect(
            getFullMapTarget({
                openInExternalTerriaMapTargetUrl: "  ",
                previewMapBaseUrl: "https://magda.example.com/preview-map/"
            })
        ).toEqual({
            kind: "builtIn",
            url: "https://magda.example.com/preview-map/"
        });
    });

    it("keeps the legacy external TerriaMap when one is configured", () => {
        expect(
            getFullMapTarget({
                openInExternalTerriaMapTargetUrl: "https://terria.example.com/",
                previewMapBaseUrl: "/preview-map/"
            })
        ).toEqual({ kind: "external", url: "https://terria.example.com/" });
    });

    it("returns undefined when neither target is available", () => {
        expect(getFullMapTarget(undefined)).toBeUndefined();
        expect(getFullMapTarget({ previewMapBaseUrl: "" })).toBeUndefined();
    });
});

describe("getTargetOrigin", () => {
    it("resolves relative and prefixed preview-map URLs against the page", () => {
        const page = "https://magda.example.com/some/prefix/dataset/ds-1";
        expect(getTargetOrigin("/preview-map/", page)).toBe(
            "https://magda.example.com"
        );
        expect(getTargetOrigin("preview-map/", page)).toBe(
            "https://magda.example.com"
        );
        expect(
            getTargetOrigin("https://maps.example.org/preview-map/", page)
        ).toBe("https://maps.example.org");
    });
});
