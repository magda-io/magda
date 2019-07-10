import React, { useState } from "react";

import Tabs from "./Tabs";
import BBoxEditor from "./BBoxEditor";
import SpatialDataPreviewer from "./SpatialDataPreviewer";
import StateSelect from "./StateSelect";
import RegionSelect from "./RegionSelect";
import AreaSelect from "./AreaSelect";

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

const RegionPanel = props => {
    return (
        <div className="region-panel">
            <div className="row">
                <div className="col-sm-3 state-select-container">
                    <div className="state-select-heading">State</div>
                    <StateSelect />
                </div>
                <div className="col-sm-9 region-select-container">
                    <div className="region-select-heading">
                        Region (ABS SA4) <span>(optional)</span>
                    </div>
                    <RegionSelect />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-6 area-select-container">
                    <div className="area-select-heading">
                        Area (ABS SA3) <span>(optional)</span>
                    </div>
                    <AreaSelect />
                </div>
            </div>
        </div>
    );
};

const initialState = {
    activeTabIndex: 0
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
