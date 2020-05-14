import "./index.scss";

import React from "react";
import ToolTip from "Components/Dataset/Add/ToolTip";
import Files from "./Files";
import DetailsContents from "./DetailsContents";
import PeopleAndProduction from "./PeopleAndProduction";

import { State } from "../../DatasetAddCommon";

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
            </div>
        </div>
    );
}
