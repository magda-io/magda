import React, { useState, FunctionComponent } from "react";
import { config } from "config";
import { Region } from "helpers/datasetSearch";
import Tabs from "./Tabs";
import RegionPanel from "./RegionPanel";
import CoordinatesPanel from "./CoordinatesPanel";

import { BoundingBox } from "helpers/datasetSearch";

import helpIcon from "assets/help.svg";
import "./index.scss";

interface StateType {
    activeTabIndex: number;
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    sa2Id?: string;
    bbox?: BoundingBox;
}

/**
 * bbox: CoordinatesPanel input
 * region: RegionPanel input
 * map: reserve for future usage
 */
export type InputMethod = "bbox" | "region" | "map";

interface PropsType {
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    bbox?: BoundingBox;
    onChange?: (
        method: InputMethod,
        bbox?: BoundingBox,
        steId?: string,
        sa4Id?: string,
        sa3Id?: string
    ) => void;
}

const initialState = (props: PropsType) => ({
    activeTabIndex: (() => {
        if (
            props.bbox &&
            props.bbox.east &&
            props.bbox.north &&
            props.bbox.south &&
            props.bbox.west &&
            !props.steId &&
            !props.sa4Id &&
            !props.sa3Id
        ) {
            return 1;
        }
        return 0;
    })(),
    steId: "",
    sa4Id: "",
    sa3Id: "",
    bbox: {
        west: config.boundingBox.west,
        north: config.boundingBox.north,
        south: config.boundingBox.south,
        east: config.boundingBox.east
    }
});

const SpatialAreaInput: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>(initialState(props));
    const onRegionPanelChange = (
        region?: Region,
        steId?: string,
        sa4Id?: string,
        sa3Id?: string,
        bbox?: BoundingBox
    ) => {
        if (typeof props.onChange !== "function") return;
        if (!region) {
            props.onChange("region", bbox, steId, sa4Id, sa3Id);
            return;
        }

        // --- regionId should be used depends on current region type
        props.onChange(
            "region",
            region.boundingBox,
            region.steId ? region.steId : region.regionId,
            region.sa4Id
                ? region.sa4Id
                : region.steId
                ? region.regionId
                : sa4Id
                ? sa4Id
                : undefined,
            region.sa3Id
                ? region.sa3Id
                : region.sa4Id
                ? region.regionId
                : sa3Id
                ? sa3Id
                : undefined
        );
    };

    const onCoordinatesPanelChange = (bbox?: BoundingBox) => {
        if (typeof bbox === "undefined" || typeof props.onChange !== "function")
            return;
        props.onChange("bbox", bbox);
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
                                            bbox={props.bbox}
                                            onChange={onRegionPanelChange}
                                        />
                                    );
                                case 1:
                                    return (
                                        <CoordinatesPanel
                                            bbox={props.bbox}
                                            onChange={onCoordinatesPanelChange}
                                        />
                                    );
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
