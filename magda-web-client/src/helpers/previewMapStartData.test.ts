import { createPreviewMapStartData } from "./previewMapStartData";

const base = {
    title: "Roads",
    distributionId: "dist-1",
    baseUrl: "/",
    storageApiUrl: "/api/v0/storage/",
    defaultBucket: "magda-datasets",
    corsDomain: "magda.example.com"
};

describe("createPreviewMapStartData", () => {
    it("builds the magda-item start data understood by magda-preview-map", () => {
        const startData = createPreviewMapStartData(base);
        expect(startData.initSources).toHaveLength(1);
        const [source] = startData.initSources;
        expect(source.catalog).toEqual([
            {
                name: "Roads",
                type: "magda-item",
                url: "/",
                storageApiUrl: "/api/v0/storage/",
                distributionId: "dist-1",
                defaultBucket: "magda-datasets",
                isEnabled: true,
                zoomOnEnable: true
            }
        ]);
        expect(source.baseMapName).toBe("Positron (Light)");
        expect(source.corsDomains).toEqual(["magda.example.com"]);
    });

    it("passes the selected WMS layer through", () => {
        const [item] = createPreviewMapStartData({
            ...base,
            selectedWmsWfsGroupItemName: "roads:layer",
            isWms: true
        }).initSources[0].catalog;
        expect(item.selectedWmsLayerName).toBe("roads:layer");
        expect(item.selectedWfsFeatureTypeName).toBeUndefined();
    });

    it("passes the selected WFS feature type through", () => {
        const [item] = createPreviewMapStartData({
            ...base,
            selectedWmsWfsGroupItemName: "roads:features",
            isWms: false
        }).initSources[0].catalog;
        expect(item.selectedWfsFeatureTypeName).toBe("roads:features");
        expect(item.selectedWmsLayerName).toBeUndefined();
    });
});
