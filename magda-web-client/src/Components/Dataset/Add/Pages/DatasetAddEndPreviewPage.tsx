import React from "react";

import "./DatasetAddEndPreviewPage.scss";

import giantTick from "assets/giant-tick.svg";

export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row end-preview-page">
            <div className="col-sm-12">
                <div className="end-preview-container-1">
                    <img
                        src={giantTick}
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
                </div>
            </div>
        </div>
    );
}
