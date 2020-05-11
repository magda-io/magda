import React, { FunctionComponent } from "react";

import { State } from "../../DatasetAddCommon";

import CollapseBox from "./CollapseBox";
import CollapseItem from "./CollapseItem";

import moment from "moment";

import "./DetailsContents.scss";

type PropsType = {
    stateData: State;
};

const DetailsContents: FunctionComponent<PropsType> = props => {
    const { dataset } = props.stateData;

    return (
        <CollapseBox
            heading="Details and contents"
            stepNum={1}
            className="dataset-details-and-contents"
        >
            <CollapseItem className="row" alwaysShow={true}>
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset title(*):
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.title ? dataset.title : "N/A"}
                </div>
            </CollapseItem>

            <CollapseItem className="row">
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset language:
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.languages ? dataset.languages.join("; ") : "N/A"}
                </div>
            </CollapseItem>

            <CollapseItem className="row">
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset keywords:
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.keywords?.keywords
                        ? dataset.keywords.keywords.join(", ")
                        : "N/A"}
                </div>
            </CollapseItem>

            <CollapseItem className="row">
                <div className="col-sm-3">
                    <div className="title-box single-line">Dataset themes:</div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.themes?.keywords
                        ? dataset.themes.keywords.join(", ")
                        : "N/A"}
                </div>
            </CollapseItem>

            <CollapseItem className="row description" alwaysShow={true}>
                <div className="col-sm-3">
                    <div className="title-box">Dataset description(*):</div>
                </div>
                <div className="col-sm-9 content-box">
                    {dataset?.description ? dataset.description : "N/A"}
                </div>
            </CollapseItem>

            <CollapseItem className="row" alwaysShow={true}>
                <div className="col-sm-3">
                    <div className="title-box single-line">
                        Dataset created(*):
                    </div>
                </div>
                <div className="col-sm-9 content-box single-line">
                    {dataset?.issued
                        ? moment(dataset.issued).format("DD/MM/YYYY")
                        : "N/A"}
                </div>
            </CollapseItem>
        </CollapseBox>
    );
};

export default DetailsContents;
