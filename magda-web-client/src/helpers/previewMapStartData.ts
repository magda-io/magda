export interface PreviewMapStartDataOptions {
    distributionId?: string;
    title?: string;
    /** Magda base URL (`config.baseUrl`); may be the relative "/". */
    baseUrl: string;
    storageApiUrl: string;
    defaultBucket: string;
    /** Host of the Magda deployment, sent as a Terria CORS domain. */
    corsDomain?: string;
    selectedWmsWfsGroupItemName?: string;
    isWms?: boolean;
}

/**
 * Build the `magda-item` start data understood by `magda-preview-map`.
 *
 * Both the embedded preview iframe and the built-in full-map window send this
 * exact payload so the dataset renders identically in either view, including
 * the WMS layer / WFS feature type picked in the preview.
 */
export function createPreviewMapStartData(options: PreviewMapStartDataOptions) {
    const catalogData: any = {
        name: options.title,
        type: "magda-item",
        url: options.baseUrl,
        storageApiUrl: options.storageApiUrl,
        distributionId: options.distributionId,
        // --- default internal storage bucket name
        defaultBucket: options.defaultBucket,
        isEnabled: true,
        zoomOnEnable: true
    };
    if (options.selectedWmsWfsGroupItemName) {
        if (options.isWms) {
            catalogData.selectedWmsLayerName =
                options.selectedWmsWfsGroupItemName;
        } else {
            catalogData.selectedWfsFeatureTypeName =
                options.selectedWmsWfsGroupItemName;
        }
    }
    return {
        initSources: [
            {
                catalog: [catalogData],
                baseMapName: "Positron (Light)",
                homeCamera: {
                    north: -8,
                    east: 158,
                    south: -45,
                    west: 109
                },
                corsDomains: options.corsDomain ? [options.corsDomain] : []
            }
        ]
    };
}
