/**
 * Base map (raster tile layer) settings for the dataset search "Any Location"
 * (region) facet map.
 */
export interface RegionFacetBaseMapConfig {
    /**
     * Leaflet tile URL template, e.g.
     * `https://tile.openstreetmap.org/{z}/{x}/{y}.png`.
     */
    url: string;
    /**
     * HTML attribution text shown on the map. Most tile providers' terms of
     * use require it.
     */
    attribution?: string;
    /**
     * Subdomains used to fill the `{s}` placeholder of the tile URL template.
     * Either a list (e.g. `["a", "b", "c"]`) or a string of single-character
     * subdomains (e.g. `"abc"`). Leaflet defaults to `"abc"`.
     */
    subdomains?: string | string[];
}

/**
 * OpenStreetMap standard tiles. Uses the bare `tile.openstreetmap.org` host
 * recommended by the OSM tile usage policy (the `{s}` / a,b,c subdomains are
 * legacy).
 *
 * Carto's `basemaps.cartocdn.com` used to be the default, but Carto now serves
 * "API key required" watermarked tiles to keyless requests (#3798).
 */
export const DEFAULT_REGION_FACET_BASE_MAP: RegionFacetBaseMapConfig = {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};

/**
 * Resolve the region facet map base map from the web server config
 * (`regionFacetBaseMap`).
 *
 * A configured `url` replaces the default as a whole: fields are not merged
 * with the OpenStreetMap default, so a different tile provider never ends up
 * labelled with the OpenStreetMap attribution (and an attribution-only config
 * cannot mislabel the OpenStreetMap tiles).
 */
export function getRegionFacetBaseMap(
    raw?: Partial<RegionFacetBaseMapConfig>
): RegionFacetBaseMapConfig {
    const url = raw?.url;
    if (typeof url !== "string" || !url.trim()) {
        return DEFAULT_REGION_FACET_BASE_MAP;
    }

    const baseMap: RegionFacetBaseMapConfig = { url: url.trim() };

    if (typeof raw?.attribution === "string") {
        baseMap.attribution = raw.attribution;
    }

    const subdomains = raw?.subdomains;
    if (
        (typeof subdomains === "string" || Array.isArray(subdomains)) &&
        subdomains.length
    ) {
        baseMap.subdomains = subdomains;
    }

    return baseMap;
}
