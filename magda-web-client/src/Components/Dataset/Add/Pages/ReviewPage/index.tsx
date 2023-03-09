import React from "react";
import "./index.scss";
import ToolTip from "Components/Dataset/Add/ToolTip";
import Files from "./Files";
import DetailsContents from "./DetailsContents";
import PeopleAndProduction from "./PeopleAndProduction";
import AccessAndUse from "./AccessAndUse";
import ApproverNote from "./ApproverNote";

import { DatasetStateUpdaterType, State } from "../../DatasetAddCommon";
import { config } from "config";
import Toggle from "rsuite/Toggle";

type PropsType = {
    isEditView: boolean;
    stateData: State;
    editStateWithUpdater: DatasetStateUpdaterType;
};

export default function DatasetAddEndPage(props: PropsType) {
    const { stateData, editStateWithUpdater, isEditView } = props;
    return (
        <div className="row review-page">
            <div className="col-sm-12">
                <h2>Review before you submit</h2>
                {isEditView ? (
                    <div className="publishing-status-section">
                        <span className="heading">
                            Dataset Publishing Status:
                        </span>
                        <Toggle
                            size="lg"
                            checkedChildren="Published"
                            unCheckedChildren="Draft"
                            checked={
                                !stateData?.datasetPublishing?.state ||
                                stateData.datasetPublishing.state ===
                                    "published"
                                    ? true
                                    : false
                            }
                            onChange={async (checked) => {
                                const publishingStatus = checked
                                    ? "published"
                                    : "draft";
                                editStateWithUpdater((state) => ({
                                    ...state,
                                    datasetPublishing: {
                                        ...state.datasetPublishing,
                                        state: publishingStatus
                                    }
                                }));
                                return checked;
                            }}
                        />
                    </div>
                ) : null}
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
