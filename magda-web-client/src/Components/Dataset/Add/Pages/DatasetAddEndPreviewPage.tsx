import React from "react";

import "./DatasetAddEndPreviewPage.scss";

import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
import printIcon from "assets/print.svg";

export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page-1">
                <div className="end-preview-container-1">
                    <img
                        src={giantTickIcon}
                        style={{ justifyContent: "center", display: "flex" }}
                    />
                    <h2>You're all done!</h2>
                </div>
                <div className="end-preview-container-2">
                    <hr />
                    <h3>
                        Your dataset has been successfully sent off for
                        approval.
                    </h3>
                    <p style={{ fontSize: "15px" }}>
                        You can view the status of your dataset from{" "}
                        <a href="/">your home page.</a>
                    </p>
                </div>
            </div>
            <div className="end-preview-page-2">
                <button className="au-btn next-button end-preview-button">
                    <img className="draft-image-icon" src={draftIcon} />
                    <p style={{ marginTop: "-20px" }}>
                        View your draft dataset
                    </p>
                </button>
                <br />
                <br />
                <button
                    className="au-btn next-button end-preview-button"
                    style={{ fontSize: "16px" }}
                >
                    <img
                        className="print-icon"
                        src={printIcon}
                        style={{
                            height: "22px",
                            width: "44px",
                            marginLeft: "20px"
                        }}
                    />
                    <p style={{ marginTop: "-25px" }}>Review Metadata</p>
                </button>
            </div>
        </div>
    );
}
