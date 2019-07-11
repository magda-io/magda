import React, { useState, FunctionComponent } from "react";
import { config } from "config";
import { Region } from "helpers/datasetSearch";
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
    bbox?: BoundingBox;
}

interface PropsType {
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    bbox?: BoundingBox;
    onChange?: (
        bbox?: BoundingBox,
        steId?: string,
        sa4Id?: string,
        sa3Id?: string
    ) => void;
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

const SpatialAreaInput: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState(initialState);
    const onRegionPanelChange = (region?: Region) => {
        if (typeof props.onChange !== "function") return;
        console.log("onRegionPanelChange: ", region);
        if (!region) {
            props.onChange();
            return;
        }
        // --- regionId should be used depends on current region type
        props.onChange(
            region.boundingBox,
            region.steId ? region.steId : region.regionId,
            region.sa4Id
                ? region.sa4Id
                : region.steId
                ? region.regionId
                : undefined,
            region.sa3Id
                ? region.sa3Id
                : region.sa4Id
                ? region.regionId
                : undefined
        );
    };
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
                                    return (
                                        <RegionPanel
                                            steId={props.steId}
                                            sa4Id={props.sa4Id}
                                            sa3Id={props.sa3Id}
                                            onChange={onRegionPanelChange}
                                        />
                                    );
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
