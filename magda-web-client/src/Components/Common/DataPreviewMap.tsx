import React, { Component, useEffect, useState } from "react";
import memoize from "memoize-one";
import "./DataPreviewMap.scss";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";
import {
    config,
    DATASETS_BUCKET,
    RawPreviewMapFormatPerferenceItem
} from "config";
import { Medium, Small } from "./Responsive";
import Spinner from "Components/Common/Spinner";
import { ParsedDistribution } from "helpers/record";
import sortBy from "lodash/sortBy";
import {
    checkFileForPreview,
    FileSizeCheckStatus,
    FileSizeCheckResult
} from "helpers/DistributionPreviewUtils";
import DataPreviewSizeWarning from "./DataPreviewSizeWarning";
import urijs from "urijs";
import isStorageApiUrl from "helpers/isStorageApiUrl";
import { useAsync } from "react-async-hook";
import fetch from "isomorphic-fetch";
import xml2json from "../../helpers/xml2json";
import ReactSelect from "react-select";
import CustomStyles from "../Common/react-select/ReactSelectStyles";

console.log(xml2json("<a><b>2332</b></a>"));

const DEFAULT_DATA_SOURCE_PREFERENCE: RawPreviewMapFormatPerferenceItem[] = [
    {
        format: "WMS",
        urlRegex: "^(?!.*(SceneServer)).*$"
    },
    {
        format: "ESRI MAPSERVER",
        urlRegex: "MapServer"
    },
    {
        format: "WFS",
        urlRegex: "^(?!.*(SceneServer)).*$"
    },
    {
        format: "ESRI FEATURESERVER",
        urlRegex: "FeatureServer"
    },
    {
        format: "GeoJSON",
        isDataFile: true
    },
    {
        format: "csv-geo-au",
        isDataFile: true
    },
    {
        format: "KML",
        isDataFile: true
    },
    {
        format: "KMZ",
        isDataFile: true
    }
];

interface PreviewMapFormatPerferenceItem {
    format: string;
    isDataFile?: boolean;
    urlRegex?: RegExp;
}

let DATA_SOURCE_PREFERENCE: PreviewMapFormatPerferenceItem[];

function getDataSourcePreference(): PreviewMapFormatPerferenceItem[] {
    if (DATA_SOURCE_PREFERENCE) {
        return DATA_SOURCE_PREFERENCE;
    }
    const preferenceList: RawPreviewMapFormatPerferenceItem[] = config
        ?.previewMapFormatPerference?.map
        ? config?.previewMapFormatPerference
        : DEFAULT_DATA_SOURCE_PREFERENCE;

    DATA_SOURCE_PREFERENCE = preferenceList.map((item) => {
        const { urlRegex, ...newItem } = item;
        if (!urlRegex) {
            return newItem as PreviewMapFormatPerferenceItem;
        }
        try {
            const regex = new RegExp(item.urlRegex as string);
            (newItem as PreviewMapFormatPerferenceItem).urlRegex = regex;
        } catch (e) {
            console.error(
                "Incorrect PreviewMapFormatPerferenceItem Regex: " +
                    (newItem as PreviewMapFormatPerferenceItem).urlRegex
            );
        }
        return newItem;
    });

    return DATA_SOURCE_PREFERENCE;
}

export const isSupportedFormat = function (format) {
    const dataSourcePreference = getDataSourcePreference().map(
        (preferenceItem) => preferenceItem.format
    );
    return (
        dataSourcePreference
            .map((item) => item.toLowerCase())
            .filter((item) => format.trim().toLowerCase() === item).length !== 0
    );
};

type BestDist = {
    dist: ParsedDistribution;
    index: number;
};

// React 16.3 advice for replacing prop -> state updates for computations
/**
 * Determines the best distribution to try to use for mapping
 */
const determineBestDistribution: (
    distributions: ParsedDistribution[]
) => BestDist | null = memoize(function determineDistribution(
    distributions: ParsedDistribution[]
) {
    const distsWithPreferences = distributions
        .map((dist) => {
            const format = dist.format.toLowerCase().trim();
            const dataUrl = dist.downloadURL
                ? dist.downloadURL
                : dist.accessURL;
            const distributionPreferenceIndex = getDataSourcePreference().findIndex(
                (preferenceItem) => {
                    if (preferenceItem.format.toLowerCase() !== format) {
                        return false;
                    }
                    if (preferenceItem.urlRegex) {
                        if (dataUrl && dataUrl.match(preferenceItem.urlRegex)) {
                            return true;
                        } else {
                            return false;
                        }
                    } else {
                        return true;
                    }
                }
            );
            if (distributionPreferenceIndex === -1) {
                return null;
            } else {
                return { dist, index: distributionPreferenceIndex };
            }
        })
        .filter((x) => !!x) as { dist: ParsedDistribution; index: number }[];

    const sorted = sortBy(distsWithPreferences, ({ index }) => index);

    if (sorted.length === 0) {
        return null;
    } else {
        return sorted[0];
    }
});

type WmsWfsGroupItemType = {
    name: string;
    title: string;
};

async function fetchWmsWfsItemList(
    url?: string,
    format?: string
): Promise<WmsWfsGroupItemType[]> {
    if (!url || typeof url !== "string") {
        return [];
    }
    if (!format || typeof format !== "string") {
        return [];
    }
    const stdFormatStr = format.trim().toLowerCase();
    if (stdFormatStr !== "wms" && stdFormatStr !== "wfs") {
        return [];
    }

    if (url.match(/\W*SceneServer\W*/i)) {
        // when url contains `SceneServer`, it will not be valid WFS / WMS url.
        // some upstream crawler might incorrectly produce this
        return [];
    }

    const isWms = stdFormatStr === "wms" ? true : false;

    try {
        const requestUrl = `${config.proxyUrl}_1d/${url}`;
        const res = await fetch(requestUrl);
        if (!res.ok) {
            return [];
        }
        const resText = await res.text();
        const jsonData = xml2json(resText.trim());
        if (isWms) {
            if (!jsonData?.Capability?.Layer?.Layer?.length) {
                // even only one layer, we will return [] as no need to render layer selection dropdown
                return [];
            }
            return jsonData.Capability.Layer.Layer.map((item) => ({
                name: item?.Name ? item.Name : "",
                title: item?.Title ? item.Title : ""
            })).filter((item) => !!item.name);
        } else {
            if (!jsonData?.FeatureTypeList?.FeatureType?.length) {
                // even only one layer, we will return [] as no need to render layer selection dropdown
                return [];
            }
            return jsonData.Capability.Layer.Layer.map((item) => ({
                name: item?.Name ? item.Name : "",
                title: item?.Title ? item.Title : ""
            })).filter((item) => !!item.name);
        }
    } catch (e) {
        return [];
    }
}

export default function DataPreviewMapWrapper(props: {
    distributions: ParsedDistribution[];
}) {
    const [
        selectedWmsWfsGroupItemName,
        setSelectedWmsWfsGroupItemName
    ] = useState("");
    const bestDist = determineBestDistribution(props.distributions);

    let format = bestDist?.dist?.format;
    if (!format || typeof format !== "string") {
        format = "";
    }
    format = format.toLocaleLowerCase().trim();

    const isWms = format === "wms" ? true : false;

    const dataUrl = bestDist?.dist?.downloadURL
        ? bestDist.dist.downloadURL
        : bestDist?.dist?.accessURL;

    const { result: wmsWfsGroupItems } = useAsync(fetchWmsWfsItemList, [
        dataUrl,
        format
    ]);

    if (!bestDist) {
        return null;
    } else {
        return (
            <div className="no-print data-preview-map-wrapper">
                <h3 className="section-heading">Map Preview</h3>
                {wmsWfsGroupItems?.length ? (
                    <div className="wms-wfs-group-item-selection">
                        <ReactSelect
                            placeholder={
                                isWms
                                    ? "Select WMS Layer..."
                                    : "Select WFS Feature Type..."
                            }
                            className="accrual-periodicity-select"
                            styles={CustomStyles}
                            isSearchable={true}
                            options={
                                wmsWfsGroupItems.map((item) => ({
                                    label: item?.title ? item.title : item.name,
                                    value: item.name
                                })) as any
                            }
                            value={
                                selectedWmsWfsGroupItemName
                                    ? {
                                          label: wmsWfsGroupItems.find(
                                              (item) =>
                                                  item.name ===
                                                  selectedWmsWfsGroupItemName
                                          )?.title,
                                          value: selectedWmsWfsGroupItemName
                                      }
                                    : null
                            }
                            onChange={(option) =>
                                setSelectedWmsWfsGroupItemName(
                                    (option as any).value
                                )
                            }
                        />
                    </div>
                ) : null}
                <Small>
                    <DataPreviewMapOpenInNationalMapButton
                        distribution={bestDist.dist}
                        style={{
                            position: "relative",
                            top: "10px",
                            visibility: "visible"
                        }}
                        buttonText="View in NationalMap"
                    />
                </Small>
                <Medium>
                    <DataPreviewMap
                        bestDist={bestDist}
                        selectedWmsWfsGroupItemName={
                            selectedWmsWfsGroupItemName
                        }
                        isWms={isWms}
                    />
                </Medium>
            </div>
        );
    }
}

function DataPreviewMap(props: {
    bestDist: BestDist;
    selectedWmsWfsGroupItemName: string;
    isWms: boolean;
}) {
    const [loading, setLoading] = useState(true);
    const [overrideFileSizeCheck, setOverrideFileSizeCheck] = useState(false);
    const [
        fileSizeCheckResult,
        setFileSizeCheckResult
    ] = useState<FileSizeCheckResult | null>(null);

    useEffect(() => {
        (async () => {
            setLoading(true);

            // If previewing this data involves downloading a single (potentially massive)
            // file, check the file size first. If it's a service, just display it.
            if (getDataSourcePreference()[props.bestDist.index].isDataFile) {
                setFileSizeCheckResult(
                    await checkFileForPreview(props.bestDist.dist)
                );
            } else {
                setFileSizeCheckResult({
                    fileSizeCheckStatus: FileSizeCheckStatus.Ok
                });
            }

            setLoading(false);
        })();
    }, [props.bestDist]);

    if (loading) {
        return <Spinner />;
    } else if (
        !overrideFileSizeCheck &&
        fileSizeCheckResult &&
        fileSizeCheckResult.fileSizeCheckStatus !== FileSizeCheckStatus.Ok
    ) {
        return (
            <DataPreviewSizeWarning
                fileSizeCheckResult={fileSizeCheckResult}
                preview={() => setOverrideFileSizeCheck(true)}
            />
        );
    } else {
        return (
            <DataPreviewMapTerria
                key={props.selectedWmsWfsGroupItemName}
                distribution={props.bestDist.dist}
                isWms={props.isWms}
                selectedWmsWfsGroupItemName={props.selectedWmsWfsGroupItemName}
            />
        );
    }
}

type State = {
    loaded: boolean;
    errorMessage: string;
    isMapInteractive: boolean;
    fileSizeCheckResult: FileSizeCheckResult | null;
};

class DataPreviewMapTerria extends Component<
    {
        distribution: ParsedDistribution;
        selectedWmsWfsGroupItemName: string;
        isWms: boolean;
    },
    State
> {
    private iframeRef: React.RefObject<HTMLIFrameElement> = React.createRef();

    state = {
        loaded: false,
        errorMessage: "",
        isMapInteractive: false,
        fileSizeCheckResult: null
    };

    componentDidMount() {
        window.addEventListener("message", this.onIframeMessageReceived);
    }

    componentWillUnmount() {
        window.removeEventListener("message", this.onIframeMessageReceived);
    }

    componentDidUpdate(prevProps) {
        if (
            this.props.distribution !== prevProps.distribution &&
            this.props.distribution
        ) {
            this.setState({
                loaded: false,
                errorMessage: ""
            });
        }
    }

    handleMapClick = () => {
        this.setState({ isMapInteractive: true });
    };

    handleMapMouseLeave = () => {
        this.setState({ isMapInteractive: false });
    };

    createCatalogItemFromDistribution(
        selectedDistribution,
        selectedWmsWfsGroupItemName: string,
        isWms: boolean
    ) {
        const catalogData: any = {
            name: selectedDistribution.title,
            type: "magda-item",
            url: config.baseUrl,
            storageApiUrl: config.storageApiUrl,
            distributionId: selectedDistribution.identifier,
            // --- default internal storage bucket name
            defaultBucket: DATASETS_BUCKET,
            isEnabled: true,
            zoomOnEnable: true
        };
        if (selectedWmsWfsGroupItemName) {
            if (isWms) {
                catalogData.selectedWmsLayerName = selectedWmsWfsGroupItemName;
            } else {
                catalogData.selectedWfsFeatureTypeName = selectedWmsWfsGroupItemName;
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
                    corsDomains: [urijs(config.baseExternalUrl).hostname()]
                }
            ]
        };
    }

    onIframeMessageReceived = (e) => {
        const selectedDistribution = this.props.distribution;

        if (!selectedDistribution || !this.iframeRef.current) return;
        const iframeWindow = this.iframeRef.current.contentWindow;
        if (!iframeWindow || iframeWindow !== e.source) return;

        if (e.data === "ready") {
            iframeWindow.postMessage(
                this.createCatalogItemFromDistribution(
                    selectedDistribution,
                    this.props.selectedWmsWfsGroupItemName,
                    this.props.isWms
                ),
                "*"
            );
            this.setState({
                loaded: false,
                errorMessage: ""
            });
            return;
        } else if (e.data === "loading complete") {
            this.setState({
                loaded: true,
                errorMessage: ""
            });
            return;
        } else {
            try {
                const data = JSON.parse(e.data);
                if (data?.type === "error") {
                    this.setState({
                        loaded: true,
                        errorMessage: data.message
                    });
                }
            } catch (e) {}
        }
    };

    render() {
        const shouldHideOpenNationalMapButton =
            this.props.distribution.downloadURL &&
            isStorageApiUrl(this.props.distribution.downloadURL);

        if (this.state.loaded && this.state.errorMessage) {
            return (
                <div className="error-message-box au-body au-page-alerts au-page-alerts--warning">
                    <h3>Map Preview Experienced an Error:</h3>
                    <p>{this.state.errorMessage}</p>
                    {this.state.errorMessage
                        .toLowerCase()
                        .indexOf("status code") !== -1 ? (
                        <p>
                            The requested data source might not be available at
                            this moment.
                        </p>
                    ) : null}
                </div>
            );
        }

        return (
            <div
                className="data-preview-map"
                onClick={this.handleMapClick}
                onMouseLeave={this.handleMapMouseLeave}
            >
                {!this.state.loaded && <Spinner width="100%" height="420px" />}
                {shouldHideOpenNationalMapButton ? null : (
                    <DataPreviewMapOpenInNationalMapButton
                        distribution={this.props.distribution}
                        buttonText="Open in NationalMap"
                        style={{
                            position: "absolute",
                            right: "10px",
                            top: "10px"
                        }}
                    />
                )}
                {this.props.distribution.identifier != null && (
                    <iframe
                        key={this.props.distribution.identifier}
                        title={this.props.distribution.title}
                        width="100%"
                        height="420px"
                        frameBorder="0"
                        src={
                            config.previewMapUrl +
                            "#mode=preview&hideExplorerPanel=1"
                        }
                        ref={this.iframeRef}
                        className={[
                            !this.state.loaded &&
                                "data-preview-map-iframe_loading",
                            !this.state.isMapInteractive &&
                                "data-preview-map-iframe_no-scroll"
                        ]
                            .filter((c) => !!c)
                            .join(" ")}
                    />
                )}
            </div>
        );
    }
}
