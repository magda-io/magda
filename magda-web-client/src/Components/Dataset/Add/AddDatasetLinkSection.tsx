import React, { useState } from "react";
import {
    Distribution,
    DistributionState,
    DistributionSource
} from "Components/Dataset/Add/DatasetAddCommon";
import "./AddDatasetLinkSection.scss";

import isUrl from "is-url";
import uuid from "uuid";
import DatasetLinkItem from "./DatasetLinkItem";

type Props = {
    distributions: Distribution[];
    addDistribution: (distribution: Distribution) => void;
    editDistribution: (
        index: number
    ) => (updater: (distribution: Distribution) => Distribution) => void;
};

const AddDatasetLinkSection = (props: Props) => {
    const [url, setUrl] = useState("");
    const [validationErrorMessage, setValidationErrorMessage] = useState("");
    const distributions = props.distributions
        .map((item, idx) => ({ distribution: item, idx }))
        .filter(
            item =>
                item.distribution.creationSource ===
                DistributionSource.DatasetUrl
        );

    const fetchUrl = () => {
        if (!isUrl(url)) {
            setValidationErrorMessage("Please input an valid URL!");
        } else {
            setValidationErrorMessage("");

            props.addDistribution({
                id: uuid.v4(),
                downloadURL: url,
                creationSource: DistributionSource.DatasetUrl,
                title: url,
                modified: new Date(),
                format: "",
                _state: DistributionState.Processing,
                _progress: 50
            });

            setUrl("");
        }
    };

    return (
        <div className="row add-dataset-link-section">
            <div className="col-sm-12">
                <h2 className="section-heading">
                    (and/or) Link to a dataset already hosted online
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
                                        editDistribution={props.editDistribution(
                                            item.idx
                                        )}
                                    />
                                ))}
                            </div>
                        </div>
                        <div className="row link-items-section-heading">
                            <div className="col-sm-12">
                                <h2>More web services to add?</h2>
                            </div>
                        </div>
                    </>
                ) : null}
                <h4 className="url-input-heading">What is the download URL?</h4>

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
                    value={url}
                />

                <button className="au-btn fetch-button" onClick={fetchUrl}>
                    Fetch
                </button>
            </div>
        </div>
    );
};

export default AddDatasetLinkSection;
