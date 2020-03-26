import React from "react";

import "./DatasetAddEndPreviewPage.scss";

import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
// import printIcon from "assets/print.svg";

export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page">
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

            <div>
                <button className="au-btn next-button">
                    View your draft dataset
                    <img
                        className="draft-image-con"
                        src={draftIcon}
                        style={{
                            marginLeft: "-200px",
                            marginTop: "-10px",
                            width: "30px",
                            height: "30px"
                        }}
                    />
                </button>
            </div>
        </div>
    );
}
