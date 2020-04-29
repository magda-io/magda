import React, { useState } from "react";
import {
    Distribution,
    DistributionState,
    DistributionSource,
    DistributionCreationMethod,
    createId
} from "Components/Dataset/Add/DatasetAddCommon";
import "./AddDatasetLinkSection.scss";

import isUrl from "is-url";
import DatasetLinkItem from "./DatasetLinkItem";

type Props = {
    type: DistributionSource.DatasetUrl | DistributionSource.Api;
    distributions: Distribution[];
    addDistribution: (distribution: Distribution) => void;
    editDistribution: (
        index: number
    ) => (updater: (distribution: Distribution) => Distribution) => void;
    deleteDistribution: (index: number) => () => void;
};

const AddDatasetLinkSection = (props: Props) => {
    const { type } = props;
    const [url, setUrl] = useState("");
    const [validationErrorMessage, setValidationErrorMessage] = useState("");
    const [processingErrorMessage, setProcessingErrorMessage] = useState("");
    const distributions = props.distributions
        .map((item, idx) => ({ distribution: item, idx }))
        .filter(item => item.distribution.creationSource === props.type);

    const fetchUrl = () => {
        if (!isUrl(url)) {
            setValidationErrorMessage("Please input an valid URL!");
        } else {
            setValidationErrorMessage("");
            setProcessingErrorMessage("");

            props.addDistribution({
                id: createId("dist"),
                downloadURL: url,
                creationSource: type,
                creationMethod: DistributionCreationMethod.Auto,
                title: url,
                modified: new Date(),
                format: "",
                _state: DistributionState.Processing,
                _progress: 50
            });
        }
    };

    const manualCreate = () => {
        if (!isUrl(url)) {
            setValidationErrorMessage("Please input an valid URL!");
        } else {
            setValidationErrorMessage("");
            setProcessingErrorMessage("");

            props.addDistribution({
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
        <div
            className={`row add-dataset-link-section ${
                type === DistributionSource.DatasetUrl
                    ? "source-dataset-url"
                    : "source-api"
            }`}
        >
            <div className="col-sm-12">
                <h2 className="section-heading">
                    {type === DistributionSource.DatasetUrl
                        ? "(and/or) Link to a dataset already hosted online"
                        : "(and/or) Link to an API or web service"}
                </h2>
                {distributions.length ? (
                    <>
                        <div className="row link-items-section">
                            <div className="col-sm-12">
                                {distributions.map(item => (
                                    <DatasetLinkItem
                                        idx={item.idx}
                                        key={item.idx}
                                        distribution={item.distribution}
                                        addDistribution={props.addDistribution}
                                        editDistribution={props.editDistribution(
                                            item.idx
                                        )}
                                        deleteDistribution={props.deleteDistribution(
                                            item.idx
                                        )}
                                        onProcessingComplete={() => setUrl("")}
                                        onProcessingError={e =>
                                            setProcessingErrorMessage(
                                                "" + (e.message ? e.message : e)
                                            )
                                        }
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="row link-items-section-heading">
                            <div className="col-sm-12">
                                <h2>
                                    {type === DistributionSource.DatasetUrl
                                        ? "More dataset URL to add?"
                                        : "More web services to add?"}
                                </h2>
                            </div>
                        </div>
                    </>
                ) : null}

                {processingErrorMessage ? (
                    <div className="process-url-error-message au-body au-page-alerts au-page-alerts--warning">
                        <h3>{processingErrorMessage}</h3>
                        <div className="heading">Here’s what you can do:</div>
                        <ul>
                            <li>
                                Double check the URL below is correct and
                                without any typos. If you need to edit the URL,
                                do so below and press ‘Fetch’ again
                            </li>
                            <li>
                                If the URL looks correct, it’s possible we can’t
                                connect to the service or extract any meaningful
                                metadata from it. You may want to try again
                                later
                            </li>
                            <li>
                                If you want to continue using this URL you can,
                                however you’ll need to manually enter the
                                dataset metadata. Use the ‘Manually enter
                                metadata’ button below
                            </li>
                        </ul>
                    </div>
                ) : null}

                <h4 className="url-input-heading">What is the URL?</h4>

                <div>
                    <span className="au-error-text">
                        {validationErrorMessage}
                    </span>
                </div>

                <input
                    className={`au-text-input url-input ${
                        validationErrorMessage ? "invalid" : ""
                    }`}
                    placeholder="Enter the download URL"
                    onChange={e => setUrl(e.target.value)}
                    onKeyUp={e => {
                        if (e.keyCode === 13) {
                            fetchUrl();
                        }
                    }}
                    value={url}
                />

                <button className="au-btn fetch-button" onClick={fetchUrl}>
                    Fetch
                </button>
                {processingErrorMessage ? (
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

export default AddDatasetLinkSection;
