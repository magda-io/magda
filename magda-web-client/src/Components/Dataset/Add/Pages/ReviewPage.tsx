import "./ReviewPage.scss";

import React from "react";
import ToolTip from "Components/Dataset/Add/ToolTip";

export default function DatasetAddEndPage(props) {
    return (
        <div className="row review-page">
            <div className="col-sm-12">
                <h2>Review before you submit</h2>
                <div className="top-tooltip">
                    <ToolTip>
                        To keep this page short, we’re defaulted to show your
                        responses to the mandatory fields. Expand each section
                        to view all the metadata fields
                    </ToolTip>
                </div>

                <div className="section-heading">
                    Dataset files and services
                    <button className="au-btn">Edit</button>
                </div>
            </div>
        </div>
    );
}
