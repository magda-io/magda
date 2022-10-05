import React from "react";

import { useHistory } from "react-router-dom";
import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
import { BsServer } from "react-icons/bs";

import "./DatasetAddEndPage.scss";

type Props = {
    datasetId: string;
    history: any;
    isEdit?: boolean;
    publishStatus?: string; // "published" | "draft" | "archived"
};

// If you are not in preview mode
export default function DatasetAddEndPage(props: Props) {
    const { datasetId, publishStatus } = props;
    const datasetPage = "/dataset/" + datasetId + "/details";
    const isEdit = typeof props?.isEdit === "undefined" ? false : props.isEdit;
    const history = useHistory();
    let viewDatasetText;
    if (publishStatus === "draft") {
        viewDatasetText = "Dataset Page";
    } else {
        viewDatasetText = "Dataset Page";
    }

    let allDoneText: string;
    if (isEdit) {
        allDoneText = "Your dataset has been updated";
    } else {
        allDoneText =
            publishStatus === "draft"
                ? "Your dataset has been successfully published."
                : "Your dataset has been successfully submitted.";
    }

    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page-1">
                <div className="end-preview-container-1">
                    <img src={giantTickIcon} className="giant-tick" />
                    <h1 className="end-preview-heading">You're all done!</h1>
                </div>
                <div className="end-preview-container-2">
                    <h2 className="end-preview-subheading">{allDoneText}</h2>
                </div>
            </div>
            <div className="col-sm-12 end-preview-page-2">
                <div>
                    <div
                        className="au-btn next-button end-preview-button data-management-btn"
                        onClick={() => {
                            history.push(
                                `/settings/datasets/${
                                    publishStatus === "published"
                                        ? "published"
                                        : "draft"
                                }`
                            );
                        }}
                    >
                        <BsServer
                            className="data-management-image-icon"
                            title="Go to data management"
                        />
                        <span className="button-text">
                            {" "}
                            {"Data Management"}{" "}
                        </span>
                    </div>
                </div>
                <div>
                    <div
                        className="au-btn next-button end-preview-button draft-dataset-btn"
                        onClick={() => history.push(datasetPage)}
                    >
                        <img
                            className="draft-image-icon"
                            src={draftIcon}
                            alt="Go to dataset page"
                        />
                        <span className="button-text"> {viewDatasetText} </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
