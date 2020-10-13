import React, { Component, useEffect, useState } from "react";
import memoize from "memoize-one";
import "./DataPreviewMap.scss";
import DataPreviewMapOpenInNationalMapButton from "./DataPreviewMapOpenInNationalMapButton";
import { config, DATASETS_BUCKET } from "config";
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

const DATA_SOURCE_PREFERENCE = [
    {
        format: "WMS",
        singleFile: false
    },
    {
        format: "ESRI REST",
        urlRegex: /MapServer/,
        singleFile: false
    },
    {
        format: "WFS",
        singleFile: false
    },
    {
        format: "GeoJSON",
        singleFile: true
    },
    {
        format: "csv-geo-au",
        singleFile: true
    },
    {
        format: "KML",
        singleFile: true
    },
    {
        format: "KMZ",
        singleFile: true
    }
];

export const isSupportedFormat = function (format) {
    const dataSourcePreference = DATA_SOURCE_PREFERENCE.map(
        (preferenceItem) => preferenceItem.format
    );
    return (
        dataSourcePreference
            .map((item) => item.toLowerCase())
            .filter((item) => format.trim() === item).length !== 0
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
            const format = dist.format.toLowerCase();
            const dataUrl = dist.downloadURL
                ? dist.downloadURL
                : dist.accessURL;
            const distributionPreferenceIndex = DATA_SOURCE_PREFERENCE.findIndex(
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
                return;
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

export default function DataPreviewMapWrapper(props: {
    distributions: ParsedDistribution[];
}) {
    const bestDist = determineBestDistribution(props.distributions);

    if (!bestDist) {
        return null;
    } else {
        return (
            <div className="no-print">
                <h3 className="section-heading">Map Preview</h3>
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
                    <DataPreviewMap bestDist={bestDist} />
                </Medium>
            </div>
        );
    }
}

function DataPreviewMap(props: { bestDist: BestDist }) {
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
            if (DATA_SOURCE_PREFERENCE[props.bestDist.index].singleFile) {
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
        return <DataPreviewMapTerria distribution={props.bestDist.dist} />;
    }
}

type State = {
    loaded: boolean;
    isMapInteractive: boolean;
    fileSizeCheckResult: FileSizeCheckResult | null;
};

class DataPreviewMapTerria extends Component<
    { distribution: ParsedDistribution },
    State
> {
    private iframeRef: React.RefObject<HTMLIFrameElement> = React.createRef();

    state = {
        loaded: false,
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
                loaded: false
            });
        }
    }

    handleMapClick = () => {
        this.setState({ isMapInteractive: true });
    };

    handleMapMouseLeave = () => {
        this.setState({ isMapInteractive: false });
    };

    createCatalogItemFromDistribution(selectedDistribution) {
        return {
            initSources: [
                {
                    catalog: [
                        {
                            name: selectedDistribution.title,
                            type: "magda-item",
                            url: config.baseUrl,
                            distributionId: selectedDistribution.identifier,
                            // --- default internal storage bucket name
                            defaultBucket: DATASETS_BUCKET,
                            isEnabled: true,
                            zoomOnEnable: true
                        }
                    ],
                    baseMapName: "Positron (Light)",
                    homeCamera: {
                        north: -8,
                        east: 158,
                        south: -45,
                        west: 109
                    }
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
                this.createCatalogItemFromDistribution(selectedDistribution),
                "*"
            );
            this.setState({
                loaded: false
            });
            return;
        } else if (e.data === "loading complete") {
            this.setState({
                loaded: true
            });
            return;
        }
    };

    render() {
        return (
            <div
                className="data-preview-map"
                onClick={this.handleMapClick}
                onMouseLeave={this.handleMapMouseLeave}
            >
                {!this.state.loaded && <Spinner width="100%" height="420px" />}
                <DataPreviewMapOpenInNationalMapButton
                    distribution={this.props.distribution}
                    buttonText="Open in NationalMap"
                    style={{
                        position: "absolute",
                        right: "10px",
                        top: "10px"
                    }}
                />
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
