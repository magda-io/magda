import { getExternalTerriaMapTargetUrl } from "./externalTerriaMap";

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
