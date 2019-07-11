import React, { useState } from "react";
import { config } from "config";
import Tabs from "./Tabs";
import RegionPanel from "./RegionPanel";
import BBoxEditor from "./BBoxEditor";
import SpatialDataPreviewer from "./SpatialDataPreviewer";

import { BoundingBox } from "helpers/datasetSearch";

import helpIcon from "assets/help.svg";
import "./index.scss";

const CoordinatesPanel = props => {
    return (
        <div className="coordinates-panel">
            <div className="editor-heading">Map preview:</div>
            <div className="row">
                <div className="col-sm-6">
                    <BBoxEditor />
                </div>
                <div className="col-sm-6">
                    <SpatialDataPreviewer />
                </div>
            </div>
        </div>
    );
};

interface StateType {
    activeTabIndex: number;
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    sa2Id?: string;
    bbox: BoundingBox;
}

const initialState: StateType = {
    activeTabIndex: 0,
    steId: "",
    sa4Id: "",
    sa3Id: "",
    bbox: {
        west: config.boundingBox.west,
        north: config.boundingBox.north,
        south: config.boundingBox.south,
        east: config.boundingBox.east
    }
};

const SpatialAreaInput = props => {
    const [state, setState] = useState(initialState);

    return (
        <div className="spatial-area-input">
            <div className="row">
                <div className="col-sm-12">
                    <Tabs
                        activeTabIndex={state.activeTabIndex}
                        onChange={index =>
                            setState({
                                ...state,
                                activeTabIndex: index
                            })
                        }
                    />
                    <div className="text-row">
                        <span>
                            This helps data users understand the scope of your
                            dataset. We’ve determined that the coordinates of
                            your data are:
                        </span>
                        <div className="help-icon-container">
                            <img src={helpIcon} />
                        </div>
                    </div>
                    <div className="tab-content-container">
                        {(() => {
                            switch (state.activeTabIndex) {
                                case 0:
                                    return <RegionPanel />;
                                case 1:
                                    return <CoordinatesPanel />;
                                default:
                                    throw new Error(
                                        "Invalid tab index: " +
                                            state.activeTabIndex
                                    );
                            }
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SpatialAreaInput;
