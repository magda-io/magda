import React, { useEffect } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { Location } from "history";
import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
import { BsServer } from "react-icons/bs";
import { useInPopUp } from "helpers/popupUtils";
import sendEventToOpener, {
    EVENT_TYPE_DATASET_EDITOR_REACH_END_PAGE
} from "libs/sendEventToOpener";
import "./DatasetAddEndPage.scss";

type Props = {
    datasetId: string;
    history: any;
    isEdit?: boolean;
    publishStatus?: string; // "published" | "draft" | "archived"
};

function checkSaveAndExit(location: Location) {
    const params = new URLSearchParams(location?.search);
    if (!params.size) return false;
    return params.has("saveExit");
}

// If you are not in preview mode
export default function DatasetAddEndPage(props: Props) {
    const { datasetId, publishStatus } = props;
    const location = useLocation();
    const isInPopUp = useInPopUp();
    const isSaveAndExit = checkSaveAndExit(location);
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
    if (isSaveAndExit) {
        allDoneText = "Your progress has been saved.";
    } else if (isEdit) {
        allDoneText = "Your dataset has been updated.";
    } else {
        allDoneText =
            publishStatus === "draft"
                ? "Your dataset has been successfully published."
                : "Your dataset has been successfully submitted.";
    }

    useEffect(() => {
        if (!datasetId) {
            return;
        }
        sendEventToOpener(EVENT_TYPE_DATASET_EDITOR_REACH_END_PAGE, {
            id: datasetId,
            reason: isSaveAndExit
                ? "draftSaved"
                : isEdit
                ? "datasetEditingSubmitted"
                : "datasetCreationSubmitted"
        });
    }, [datasetId, isEdit, isSaveAndExit]);

    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page-1">
                <div className="end-preview-container-1">
                    <img
                        alt="tick_icon"
                        src={giantTickIcon}
                        className="giant-tick"
                    />
                    <h1 className="end-preview-heading">You're all done!</h1>
                </div>
                <div className="end-preview-container-2">
                    <h2 className="end-preview-subheading">{allDoneText}</h2>
                </div>
            </div>
            {isInPopUp ? null : (
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
                            <span className="button-text">
                                {" "}
                                {viewDatasetText}{" "}
                            </span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
