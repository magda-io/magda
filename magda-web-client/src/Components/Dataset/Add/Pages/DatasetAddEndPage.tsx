import "./DatasetAddEndPage.scss";

import React from "react";
import { Link } from "react-router-dom";

import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
import printIcon from "assets/print.svg";

type Props = {
    datasetId: string;
    history: any;
    isEdit?: boolean;
    publishStatus: string; // "published" | "draft" | "archived"
};

// If you are not in preview mode
export default function DatasetAddEndPage(props: Props) {
    const { datasetId, publishStatus } = props;
    const datasetPage = "/dataset/" + datasetId + "/details";
    const isEdit = typeof props?.isEdit === "undefined" ? false : props.isEdit;
    console.log("props are: ", props);
    let viewDatasetText;
    if (publishStatus === "draft") {
        viewDatasetText = "View your draft dataset";
    } else {
        viewDatasetText = "View your dataset";
    }

    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page-1">
                <div className="end-preview-container-1">
                    <img src={giantTickIcon} className="giant-tick" />
                    <h1 className="end-preview-heading">You're all done!</h1>
                </div>
                <div className="end-preview-container-2">
                    <h2 className="end-preview-subheading">
                        {isEdit
                            ? "Your dataset has been updated"
                            : "Your dataset has been successfully sent off for approval."}
                    </h2>
                    <p className="dataset-status-txt">
                        You can view the status of your datasets from{" "}
                        <a href="/">your home page</a>.
                    </p>
                </div>
            </div>
            <div className="col-sm-12 end-preview-page-2">
                <div>
                    <Link to={datasetPage}>
                        <a className="au-btn next-button end-preview-button draft-dataset-btn">
                            <img className="draft-image-icon" src={draftIcon} />
                            <span className="draft-dataset-txt">
                                {" "}
                                {viewDatasetText}{" "}
                            </span>
                        </a>
                    </Link>
                </div>
                <div>
                    <Link to={datasetPage + "?print=true"}>
                        <a className="au-btn next-button end-preview-button print-metadata-btn">
                            <img className="print-icon" src={printIcon} />
                            <span className="print-metadata-txt">
                                Print a copy of your metadata
                            </span>
                        </a>
                    </Link>
                </div>
            </div>
        </div>
    );
}
