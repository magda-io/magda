import React from "react";
import "./index.scss";
import ToolTip from "Components/Dataset/Add/ToolTip";
import Files from "./Files";
import DetailsContents from "./DetailsContents";
import PeopleAndProduction from "./PeopleAndProduction";
import AccessAndUse from "./AccessAndUse";
import ApproverNote from "./ApproverNote";

import { State } from "../../DatasetAddCommon";
import { config } from "config";

type PropsType = {
    stateData: State;
};

export default function DatasetAddEndPage(props: PropsType) {
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

                <Files stateData={props.stateData} />

                <DetailsContents stateData={props.stateData} />

                <PeopleAndProduction stateData={props.stateData} />

                <AccessAndUse stateData={props.stateData} />

                {config.featureFlags.datasetApprovalWorkflowOn && (
                    <ApproverNote stateData={props.stateData} />
                )}
            </div>
        </div>
    );
}
