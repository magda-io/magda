import React from "react";
import { createRoot, Root } from "react-dom/client";
import { act } from "react-dom/test-utils";
import { config } from "../../config";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";

jest.mock("../../config", () => ({
    config: {},
    DATASETS_BUCKET: "magda-datasets"
}));

// `jest.mock` is hoisted, so this is the mocked, mutable config object.
const mockConfig = config as Record<string, any>;

const distribution: any = {
    identifier: "dist-1",
    title: "Roads",
    format: "WMS",
    downloadURL: "https://maps.example.com/wms"
};

let container: HTMLDivElement;
let root: Root;

function renderButton(props: Record<string, any> = {}) {
    act(() => {
        root.render(
            <DataPreviewMapOpenInNationalMapButton
                distribution={distribution}
                buttonText="Open in NationalMap"
                style={{}}
                {...props}
            />
        );
    });
    return container.querySelector("button");
}

function dispatchMessage(source: any, origin: string, data: unknown) {
    act(() => {
        window.dispatchEvent(
            new MessageEvent("message", { source, origin, data })
        );
    });
}

beforeAll(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
    Object.keys(mockConfig).forEach((key) => delete mockConfig[key]);
    Object.assign(mockConfig, {
        baseUrl: "/",
        baseExternalUrl: "http://localhost/",
        storageApiBaseUrl: "/api/v0/storage/",
        previewMapBaseUrl: "/preview-map/"
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
});

describe("built-in full map (no external TerriaMap configured)", () => {
    it("renders 'Open full map' and opens preview-map without preview mode", () => {
        const popup = { postMessage: jest.fn() };
        const open = jest.spyOn(window, "open").mockReturnValue(popup as any);

        const button = renderButton();
        expect(button?.textContent).toBe("Open full map");

        act(() => button!.click());
        expect(open).toHaveBeenCalledWith("/preview-map/", "_blank");
        expect(open.mock.calls[0][0]).not.toMatch(/mode=preview/);
    });

    it("answers the full map's 'ready' with the magda-item start data", () => {
        const popup = { postMessage: jest.fn() };
        jest.spyOn(window, "open").mockReturnValue(popup as any);

        const button = renderButton({
            selectedWmsWfsGroupItemName: "roads:layer",
            isWms: true
        });
        act(() => button!.click());

        // Messages from other windows or origins are ignored.
        dispatchMessage({}, window.location.origin, "ready");
        dispatchMessage(popup, "https://evil.example.com", "ready");
        expect(popup.postMessage).not.toHaveBeenCalled();

        dispatchMessage(popup, window.location.origin, "ready");
        expect(popup.postMessage).toHaveBeenCalledTimes(1);
        const [startData, targetOrigin] = popup.postMessage.mock.calls[0];
        expect(targetOrigin).toBe(window.location.origin);
        expect(startData.initSources[0].catalog[0]).toMatchObject({
            type: "magda-item",
            url: "/",
            distributionId: "dist-1",
            storageApiUrl: "/api/v0/storage/",
            defaultBucket: "magda-datasets",
            selectedWmsLayerName: "roads:layer",
            isEnabled: true,
            zoomOnEnable: true
        });
    });

    it("uses the configured label override", () => {
        mockConfig.openInExternalTerriaMapButtonText = "Explore on map";
        expect(renderButton()?.textContent).toBe("Explore on map");
    });

    it("is shown for Storage API files, which the same-origin full map can load", () => {
        const popup = { postMessage: jest.fn() };
        jest.spyOn(window, "open").mockReturnValue(popup as any);

        for (const downloadURL of [
            "magda://storage-api/ds-1/dist-1/file.geojson",
            "http://localhost/api/v0/storage/magda-datasets/ds-1/dist-1/file.geojson"
        ]) {
            const button = renderButton({
                distribution: { ...distribution, downloadURL }
            });
            expect(button?.textContent).toBe("Open full map");
        }

        const button = renderButton({
            distribution: {
                ...distribution,
                downloadURL: "magda://storage-api/ds-1/dist-1/file.geojson"
            }
        });
        act(() => button!.click());
        dispatchMessage(popup, window.location.origin, "ready");
        expect(
            popup.postMessage.mock.calls[0][0].initSources[0].catalog[0]
        ).toMatchObject({
            distributionId: "dist-1",
            storageApiUrl: "/api/v0/storage/",
            defaultBucket: "magda-datasets"
        });
    });

    it("shows the popup-blocked message", () => {
        jest.spyOn(window, "open").mockReturnValue(null);
        const alert = jest
            .spyOn(window, "alert")
            .mockImplementation(() => undefined);
        const button = renderButton();
        act(() => button!.click());
        expect(alert).toHaveBeenCalledWith(
            expect.stringMatching(/blocked by a popup blocker/)
        );
    });
});

describe("external TerriaMap (legacy)", () => {
    beforeEach(() => {
        mockConfig.openInExternalTerriaMapTargetUrl =
            "https://terria.example.com/";
    });

    it("keeps the legacy label and target", () => {
        const popup = { postMessage: jest.fn() };
        const open = jest.spyOn(window, "open").mockReturnValue(popup as any);

        const button = renderButton();
        expect(button?.textContent).toBe("Open in NationalMap");
        act(() => button!.click());
        expect(open).toHaveBeenCalledWith(
            "https://terria.example.com/",
            "_blank"
        );

        dispatchMessage(popup, "https://terria.example.com", "ready");
        const [startData, targetOrigin] = popup.postMessage.mock.calls[0];
        expect(targetOrigin).toBe("*");
        expect(startData.initSources[0].catalog[0].type).toBe("magda");
    });

    it("stays hidden for Storage API files the remote map cannot read", () => {
        for (const downloadURL of [
            "magda://storage-api/ds-1/dist-1/file.geojson",
            "http://localhost/api/v0/storage/magda-datasets/ds-1/dist-1/file.geojson"
        ]) {
            expect(
                renderButton({ distribution: { ...distribution, downloadURL } })
            ).toBeNull();
        }
    });
});
