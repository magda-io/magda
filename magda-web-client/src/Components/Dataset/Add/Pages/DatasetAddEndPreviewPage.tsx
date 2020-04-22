import React from "react";

import "./DatasetAddEndPreviewPage.scss";

import giantTickIcon from "assets/giant-tick.svg";
import draftIcon from "assets/format-active.svg";
import printIcon from "assets/print.svg";
import { Link } from "react-router-dom";

// If you are in Preview Mode
export default function DatasetAddEndPreviewPage() {
    return (
        <div className="row people-and-production-page">
            <div className="col-sm-12">
                <h2>You've completed the Add Dataset Preview!</h2>
                <hr />
                <p>
                    Soon, you'll be able to submit the dataset so that it can be
                    discovered via search and shared with your colleagues. For
                    now, your dataset is saved on your local computer, and you
                    can see it at any time in the{" "}
                    <Link to="/dataset/list">drafts page</Link>.
                </p>

                <p>
                    In the meantime, we on the Magda team are looking for
                    feedback on the process you just completed. If you'd like to
                    let us know how we did, please click the "Send Us Your
                    Thoughts" button below:
                </p>
                <p>Thanks!</p>
                <p>
                    Alex, Alyce, Jacky and Mel from the{" "}
                    <a href="https://magda.io">Magda</a> team at CSIRO's Data61.
                </p>
            </div>
        </div>
    );
}

// If you are not in preview mode
export function DatasetAddEndPage() {
    return (
        <div className="row">
            <div className="col-sm-12 end-preview-page-1">
                <div className="end-preview-container-1">
                    <img src={giantTickIcon} className="giant-tick" />
                    <h2>You're all done!</h2>
                </div>
                <br />
                <div className="end-preview-container-2">
                    <h3>
                        Your dataset has been successfully sent off for
                        approval.
                    </h3>
                    <br />
                    <p className="dataset-status-txt">
                        You can view the status of your dataset from{" "}
                        <a href="/">your home page</a>.
                    </p>
                </div>
                <br />
                <br />
                <br />
            </div>
            <div className="end-preview-page-2">
                <button className="au-btn next-button end-preview-button draft-dataset-btn">
                    <img className="draft-image-icon" src={draftIcon} />
                    <p className="draft-dataset-txt">View your draft dataset</p>
                </button>
                <br />
                <br />
                <button className="au-btn next-button end-preview-button print-metadata-btn">
                    <img className="print-icon" src={printIcon} />
                    <p className="print-metadata-txt">
                        Print a copy of your metadata
                    </p>
                </button>
            </div>
        </div>
    );
}
