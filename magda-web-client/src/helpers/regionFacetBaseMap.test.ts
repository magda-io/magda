import {
    DEFAULT_REGION_FACET_BASE_MAP,
    getRegionFacetBaseMap
} from "./regionFacetBaseMap";

describe("getRegionFacetBaseMap", () => {
    it("defaults to OpenStreetMap tiles when no config is supplied", () => {
        const baseMap = getRegionFacetBaseMap(undefined);
        expect(baseMap).toEqual(DEFAULT_REGION_FACET_BASE_MAP);
        expect(baseMap.url).toBe(
            "https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        );
        expect(baseMap.attribution).toContain("OpenStreetMap");
    });

    it("never defaults to the CARTO basemaps", () => {
        expect(getRegionFacetBaseMap({}).url).not.toContain("cartocdn");
    });

    it("uses the default when the url is missing, blank or not a string", () => {
        expect(getRegionFacetBaseMap({})).toEqual(
            DEFAULT_REGION_FACET_BASE_MAP
        );
        expect(getRegionFacetBaseMap({ url: "   " })).toEqual(
            DEFAULT_REGION_FACET_BASE_MAP
        );
        expect(getRegionFacetBaseMap({ url: 123 as any })).toEqual(
            DEFAULT_REGION_FACET_BASE_MAP
        );
        expect(getRegionFacetBaseMap("not an object" as any)).toEqual(
            DEFAULT_REGION_FACET_BASE_MAP
        );
    });

    it("ignores an attribution-only config rather than mislabelling OSM tiles", () => {
        expect(
            getRegionFacetBaseMap({ attribution: "&copy; Someone else" })
        ).toEqual(DEFAULT_REGION_FACET_BASE_MAP);
    });

    it("uses a configured tile provider", () => {
        expect(
            getRegionFacetBaseMap({
                url:
                    " https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?api_key=xxx ",
                attribution: "&copy; OSM, &copy; CARTO",
                subdomains: ["a", "b", "c", "d"]
            })
        ).toEqual({
            url:
                "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png?api_key=xxx",
            attribution: "&copy; OSM, &copy; CARTO",
            subdomains: ["a", "b", "c", "d"]
        });
    });

    it("does not carry the OpenStreetMap attribution over to a configured provider", () => {
        expect(
            getRegionFacetBaseMap({
                url: "https://tiles.example.com/{z}/{x}/{y}.png"
            })
        ).toEqual({ url: "https://tiles.example.com/{z}/{x}/{y}.png" });
    });

    it("accepts subdomains as a string and drops invalid subdomains", () => {
        expect(
            getRegionFacetBaseMap({
                url: "https://{s}.tiles.example.com/{z}/{x}/{y}.png",
                subdomains: "1234"
            }).subdomains
        ).toBe("1234");
        expect(
            getRegionFacetBaseMap({
                url: "https://{s}.tiles.example.com/{z}/{x}/{y}.png",
                subdomains: []
            }).subdomains
        ).toBeUndefined();
        expect(
            getRegionFacetBaseMap({
                url: "https://{s}.tiles.example.com/{z}/{x}/{y}.png",
                subdomains: 3 as any
            }).subdomains
        ).toBeUndefined();
    });
});
