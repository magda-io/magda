import React, { useState, FunctionComponent } from "react";
import { Region } from "helpers/datasetSearch";
import StateSelect from "./StateSelect";
import RegionSelect from "./RegionSelect";
import AreaSelect from "./AreaSelect";
import SpatialDataPreviewer from "./SpatialDataPreviewer";

import { BoundingBox } from "helpers/datasetSearch";

interface StateType {
    steRegion?: Region;
    sa4Region?: Region;
    sa3Region?: Region;
}

interface PropsType {
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    bbox?: BoundingBox;
    onChange?: (
        region?: Region,
        steId?: string,
        sa4?: string,
        sa3?: string,
        bbox?: BoundingBox
    ) => void;
}

export type OptionType = Region;

const initialState = props => ({
    steRegion: props.steRegion,
    sa4Region: props.sa4Region,
    sa3Region: props.sa3Region
});

const RegionPanel: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>(initialState(props));
    const onChange: (state: StateType, props: PropsType) => void = (
        state,
        props
    ) => {
        if (typeof props.onChange !== "function") return;
        if (state.sa3Region) {
            props.onChange(state.sa3Region);
        } else if (state.sa4Region) {
            props.onChange(state.sa4Region, undefined, undefined, props.sa3Id);
        } else if (state.steRegion) {
            props.onChange(
                state.steRegion,
                undefined,
                props.sa4Id,
                props.sa3Id
            );
        } else {
            props.onChange(
                undefined,
                props.steId,
                props.sa4Id,
                props.sa3Id,
                props.steId || props.sa4Id || props.sa3Id
                    ? props.bbox
                    : undefined
            );
        }
    };

    return (
        <div className="region-panel">
            <div className="row">
                <div className="col-sm-3 state-select-container">
                    <div className="state-select-heading">State</div>
                    <StateSelect
                        value={state.steRegion}
                        regionId={props.steId}
                        onChange={(option, notResetOtherRegions) =>
                            setState(state => {
                                notResetOtherRegions = notResetOtherRegions
                                    ? true
                                    : false;
                                const newState = {
                                    ...state,
                                    steRegion: option
                                        ? { ...option }
                                        : undefined
                                };
                                if (!notResetOtherRegions) {
                                    newState.sa4Region = undefined;
                                    newState.sa3Region = undefined;
                                }
                                onChange(newState, props);
                                return newState;
                            })
                        }
                    />
                </div>
                <div className="col-sm-9 region-select-container">
                    <div className="region-select-heading">
                        Region (ABS SA4) <span>(optional)</span>
                    </div>
                    <RegionSelect
                        value={state.sa4Region}
                        regionId={props.sa4Id}
                        steRegion={state.steRegion}
                        onChange={(option, notResetOtherRegions) =>
                            setState(state => {
                                const newState = {
                                    ...state,
                                    sa4Region: option
                                        ? { ...option }
                                        : undefined
                                };
                                if (!notResetOtherRegions) {
                                    newState.sa3Region = undefined;
                                }
                                onChange(newState, props);
                                return newState;
                            })
                        }
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-6 area-select-container">
                    <div className="area-select-heading">
                        Area (ABS SA3) <span>(optional)</span>
                    </div>
                    <AreaSelect
                        value={state.sa3Region}
                        regionId={props.sa3Id}
                        steRegion={state.steRegion}
                        sa4Region={state.sa4Region}
                        onChange={option =>
                            setState(state => {
                                const newState = {
                                    ...state,
                                    sa3Region: option
                                        ? { ...option }
                                        : undefined
                                };
                                onChange(newState, props);
                                return newState;
                            })
                        }
                    />
                </div>
            </div>
            <div className="row">
                <div className="col-sm-12 spatial-data-previewer-container">
                    <SpatialDataPreviewer
                        bbox={
                            props.steId || props.sa4Id || props.sa3Id
                                ? props.bbox
                                : undefined
                        }
                    />
                </div>
            </div>
        </div>
    );
};

export default RegionPanel;
