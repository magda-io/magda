import React, { FunctionComponent, useState } from "react";
import isUrl from "is-url";
import {
    Distribution,
    DistributionState,
    DistributionSource,
    DistributionCreationMethod,
    DatasetStateUpdaterType,
    createId,
    getDistributionDeleteCallback,
    getDistributionAddCallback,
    getDistributionUpdateCallback
} from "Components/Dataset/Add/DatasetAddCommon";
import { getDataUrlProcessorResult } from "api-clients/openfaasApis";

import "./AddDatasetFromLinkInput.scss";
import { useAsyncCallback } from "react-async-hook";
import moment from "moment";
import {
    dcatDistributionStrings,
    DcatDatasetStrings,
    TemporalCoverage
} from "helpers/record";

type Props = {
    type?: DistributionSource.DatasetUrl | DistributionSource.Api;
    datasetStateUpdater: DatasetStateUpdaterType;
    onProcessingError: (Error) => void;
    onClearProcessingError: () => void;
    onProcessingComplete?: (distributions: Distribution[]) => void;
};

type DistributionAspectsProcessor = (aspects: {
    [aspectId: string]: any;
}) => Partial<Distribution>;

const processSpatialCoverage: DistributionAspectsProcessor = (aspects) => {
    const aspectData = aspects?.["spatial-coverage"];

    if (!aspectData) {
        return {};
    }

    if (aspectData?.bbox?.length !== 4) {
        return {};
    }

    const bbox = aspectData.bbox
        .map((item) => (typeof item === "string" ? parseFloat(item) : item))
        .filter((item) => typeof item === "number" && !isNaN(item));

    if (bbox.length !== 4) {
        return {};
    }

    return {
        spatialCoverage: {
            spatialDataInputMethod: "bbox",
            bbox
        }
    };
};

const processDcatDistributionStrings: DistributionAspectsProcessor = (
    aspects
) => {
    const aspectData = aspects?.["dcat-distribution-strings"];
    if (!aspectData) {
        return {};
    }

    const {
        issued,
        modified,
        ...otherAspectData
    } = aspectData as dcatDistributionStrings;

    const distData: Partial<Distribution> = {
        ...otherAspectData
    };

    if (issued) {
        const issuedData = moment(distData.issued);
        if (issuedData.isValid()) {
            distData.issued = issuedData.toDate();
        }
    }

    if (modified) {
        const modifiedData = moment(distData.modified);
        if (modifiedData.isValid()) {
            distData.modified = modifiedData.toDate();
        }
    }

    return distData;
};

const processDcatDatasetStrings: DistributionAspectsProcessor = (aspects) => {
    const aspectData = aspects?.["dcat-dataset-strings"] as DcatDatasetStrings;
    if (!aspectData) {
        return {};
    }

    const distData: Partial<Distribution> = {};

    if (aspectData?.title) {
        distData.datasetTitle = aspectData.title;
    }

    if (aspectData?.keywords) {
        if (typeof aspectData.keywords === "string") {
            distData.keywords = [aspectData.keywords];
        } else if (aspectData?.keywords?.length) {
            distData.keywords = aspectData.keywords;
        }
    }

    if (aspectData?.themes) {
        if (typeof aspectData.themes === "string") {
            distData.themes = [aspectData.themes];
        } else if (aspectData?.themes?.length) {
            distData.themes = aspectData.themes;
        }
    }

    if (aspectData?.temporal) {
        if (typeof aspectData.themes === "string") {
            distData.themes = [aspectData.themes];
        } else if (aspectData?.themes?.length) {
            distData.themes = aspectData.themes;
        }
    }

    return distData;
};

const processTemporalCoverage: DistributionAspectsProcessor = (aspects) => {
    const aspectData = aspects?.["temporal-coverage"] as TemporalCoverage;

    if (!aspectData || !aspectData?.intervals?.length) {
        return {};
    }

    const intervals = aspectData.intervals
        .map((item) => {
            const startDate = item?.start ? moment(item?.start) : undefined;
            const endDate = item?.end ? moment(item?.end) : undefined;
            if (!startDate?.isValid() && !endDate?.isValid()) {
                return null;
            } else {
                const newItem: any = {};
                if (startDate?.isValid()) {
                    newItem.start = startDate.toDate();
                }
                if (endDate?.isValid()) {
                    newItem.end = endDate.toDate();
                }
                return newItem;
            }
        })
        .filter((item) => item);

    if (!intervals.length) {
        return {};
    }

    return {
        temporalCoverage: {
            intervals
        }
    };
};

const AddDatasetFromLinkInput: FunctionComponent<Props> = (props) => {
    const { type, datasetStateUpdater } = props;
    const [url, setUrl] = useState("");
    const [validationErrorMessage, setValidationErrorMessage] = useState("");
    const [hasProcessingError, setHasProcessingError] = useState(false);
    const fetchUrl = useAsyncCallback(
        async (
            url: string,
            type?: DistributionSource.DatasetUrl | DistributionSource.Api
        ) => {
            if (!isUrl(url)) {
                setValidationErrorMessage("Please input an valid URL!");
                return;
            }

            setValidationErrorMessage("");
            setHasProcessingError(false);
            props?.onClearProcessingError();

            const processingDistId = createId("dist");

            try {
                getDistributionAddCallback(datasetStateUpdater)({
                    id: processingDistId,
                    downloadURL: url,
                    // --- when type is not specify, we don't know the url type yet until one of processor is resolved.
                    // --- before that, we set it to DistributionSource.DatasetUrl by default and update it later
                    creationSource: type ? type : DistributionSource.DatasetUrl,
                    creationMethod: DistributionCreationMethod.Auto,
                    title: url,
                    modified: new Date(),
                    format: "",
                    _state: DistributionState.Processing,
                    _progress: 50
                });

                const [data, dataType] = await getDataUrlProcessorResult(
                    url,
                    type
                );

                // --- set creationSource. as one of processors is resolved, we now know the type of the url
                getDistributionUpdateCallback(datasetStateUpdater)(
                    processingDistId,
                    (dist) => ({
                        ...dist,
                        creationSource: dataType
                    })
                );

                const dists = data.distributions.map((distRecord, idx) => ({
                    id: idx === 0 ? processingDistId : createId("dist"),
                    downloadURL: url,
                    creationSource: dataType,
                    creationMethod: DistributionCreationMethod.Auto,
                    title: url,
                    modified: new Date(),
                    format: "",
                    _state: DistributionState.Ready,
                    _progress: 100,
                    ...processDcatDatasetStrings(data?.dataset?.aspects),
                    ...processDcatDistributionStrings(distRecord?.aspects),
                    ...processSpatialCoverage(distRecord?.aspects),
                    ...processTemporalCoverage(distRecord?.aspects)
                }));

                datasetStateUpdater((state) => {
                    const distributions = state.distributions.map((item) =>
                        item.id === processingDistId
                            ? { ...item, ...dists[0] }
                            : item
                    );
                    if (dists.length > 1) {
                        return {
                            ...state,
                            distributions: [...distributions, ...dists.slice(1)]
                        };
                    } else {
                        return {
                            ...state,
                            distributions: [...distributions]
                        };
                    }
                });
                setUrl("");

                if (typeof props?.onProcessingComplete === "function") {
                    props.onProcessingComplete(dists);
                }
            } catch (e) {
                getDistributionDeleteCallback(datasetStateUpdater)(
                    processingDistId
                );
                setHasProcessingError(true);
                props.onProcessingError(e);
            }
        }
    );

    const manualCreate = () => {
        if (!isUrl(url)) {
            setValidationErrorMessage("Please input an valid URL!");
        } else {
            setValidationErrorMessage("");
            setHasProcessingError(false);
            props?.onClearProcessingError();

            getDistributionAddCallback(datasetStateUpdater)({
                id: createId("dist"),
                downloadURL: url,
                creationSource: type,
                creationMethod: DistributionCreationMethod.Manual,
                title: url,
                modified: new Date(),
                format: "",
                _state: DistributionState.Drafting
            });

            setUrl("");
        }
    };

    return (
        <div className="add-dataset-from-link-input-outter-container">
            <div className="add-dataset-from-link-input-error-message-container">
                <span className="au-error-text">{validationErrorMessage}</span>
            </div>
            <div className="add-dataset-from-link-input-inner-container">
                <input
                    className={`au-text-input url-input ${
                        validationErrorMessage ? "invalid" : ""
                    }`}
                    placeholder="Enter the download URL"
                    onChange={(e) => setUrl(e.target.value)}
                    onKeyUp={(e) => {
                        if (e.keyCode === 13) {
                            fetchUrl.execute(url, props.type);
                        }
                    }}
                    value={url}
                />

                <button
                    className="au-btn fetch-button"
                    disabled={fetchUrl.loading}
                    onClick={() => fetchUrl.execute(url, props.type)}
                >
                    Fetch
                </button>
                {hasProcessingError ? (
                    <button
                        className="au-btn au-btn--secondary manual-enter-metadata-button"
                        onClick={manualCreate}
                    >
                        Manually enter metadata
                    </button>
                ) : null}
            </div>
        </div>
    );
};

export default AddDatasetFromLinkInput;
