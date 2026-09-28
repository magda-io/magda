export interface ExternalTerriaMapConfig {
    openInExternalTerriaMapTargetUrl?: string;
}

/**
 * Resolve the external TerriaMap target URL for the Map Preview "open in external
 * map" button.
 *
 * The button only makes sense when an operator has explicitly configured a remote
 * TerriaMap to send the dataset to. The historical hard-coded default,
 * `https://nationalmap.gov.au/`, has been discontinued, so an unset (or blank)
 * target URL now means "do not render the button" rather than falling back to a
 * dead site.
 *
 * Returns the trimmed target URL when configured, or `undefined` when the button
 * should be hidden. (The built-in full-map view that will eventually replace this
 * button is tracked separately.)
 */
export function getExternalTerriaMapTargetUrl(
    config?: ExternalTerriaMapConfig
): string | undefined {
    const url = config?.openInExternalTerriaMapTargetUrl;
    return typeof url === "string" && url.trim() ? url.trim() : undefined;
}
