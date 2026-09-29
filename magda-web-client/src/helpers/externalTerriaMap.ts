export interface ExternalTerriaMapConfig {
    openInExternalTerriaMapTargetUrl?: string;
}

/**
 * Resolve the external TerriaMap target URL for the Map Preview "open full map"
 * button.
 *
 * The historical hard-coded default, `https://nationalmap.gov.au/`, has been
 * discontinued, so an unset (or blank) target URL means "no external TerriaMap";
 * the button then opens the built-in full-map view instead (see
 * `getFullMapTarget`).
 *
 * Returns the trimmed target URL when configured, or `undefined` otherwise.
 */
export function getExternalTerriaMapTargetUrl(
    config?: ExternalTerriaMapConfig
): string | undefined {
    const url = config?.openInExternalTerriaMapTargetUrl;
    return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

export interface FullMapConfig extends ExternalTerriaMapConfig {
    previewMapBaseUrl?: string;
}

export type FullMapTarget =
    | { kind: "external"; url: string }
    | { kind: "builtIn"; url: string };

/**
 * Resolve where the Map Preview "open full map" button sends the dataset.
 *
 * - A configured `openInExternalTerriaMapTargetUrl` keeps the legacy behaviour:
 *   open that remote TerriaMap and post it the external-format init.
 * - Otherwise open the deployment's own `magda-preview-map` module in full mode
 *   (i.e. without `#mode=preview`), which accepts the same `magda-item` init as
 *   the embedded preview.
 *
 * Returns `undefined` when neither target is available.
 */
export function getFullMapTarget(
    config?: FullMapConfig
): FullMapTarget | undefined {
    const externalUrl = getExternalTerriaMapTargetUrl(config);
    if (externalUrl) {
        return { kind: "external", url: externalUrl };
    }
    const previewMapBaseUrl = config?.previewMapBaseUrl;
    return typeof previewMapBaseUrl === "string" && previewMapBaseUrl.trim()
        ? { kind: "builtIn", url: previewMapBaseUrl.trim() }
        : undefined;
}

/**
 * The origin to address `postMessage` to for a (possibly relative) target URL,
 * resolved against the current page.
 */
export function getTargetOrigin(targetUrl: string, pageUrl: string): string {
    return new URL(targetUrl, pageUrl).origin;
}
