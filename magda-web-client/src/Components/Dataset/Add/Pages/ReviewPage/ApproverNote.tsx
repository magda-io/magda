import React, { FunctionComponent } from "react";

import { State } from "../../DatasetAddCommon";

import CollapseBox from "./CollapseBox";
import CollapseItem from "./CollapseItem";

import DescriptionBox from "Components/Common/DescriptionBox";

import "./ApproverNote.scss";

type PropsType = {
    stateData: State;
};

const ApproverNote: FunctionComponent<PropsType> = props => {
    const { datasetPublishing } = props.stateData;

    return (
        <CollapseBox
            heading="Approver note"
            stepNum={4}
            className="approver-note"
        >
            <CollapseItem className="row" alwaysShow={true}>
                <div className="col-sm-3">
                    <div className="title-box">Note contents:</div>
                </div>
                <DescriptionBox
                    className="col-sm-9 content-box note-content-box"
                    isAutoTruncate={false}
                    content={
                        datasetPublishing?.notesToApprover
                            ? datasetPublishing?.notesToApprover
                            : "N/A"
                    }
                />
            </CollapseItem>
        </CollapseBox>
    );
};

export default ApproverNote;
