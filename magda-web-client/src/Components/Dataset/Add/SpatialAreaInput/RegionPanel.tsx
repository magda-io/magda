import React, { useState, FunctionComponent } from "react";
import { Region } from "helpers/datasetSearch";
import StateSelect from "./StateSelect";
import RegionSelect from "./RegionSelect";
import AreaSelect from "./AreaSelect";

interface StateType {
    steRegion?: Region;
    sa4Region?: Region;
    sa3Region?: Region;
}

interface PropsType {
    steId?: string;
    sa4Id?: string;
    sa3Id?: string;
    onChange?: (region?: Region) => void;
}

export type OptionType = Region;

const initialState = props => ({
    steRegion: props.steRegion,
    sa4Region: props.sa4Region,
    sa3Region: props.sa3Region
});

const RegionPanel: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>(initialState(props));
    const onChange: (newState: StateType) => void = newState => {
        if (typeof props.onChange !== "function") return;
        if (newState.sa3Region) {
            props.onChange(newState.sa3Region);
        } else if (newState.sa4Region) {
            props.onChange(newState.sa4Region);
        } else if (newState.steRegion) {
            props.onChange(newState.steRegion);
        } else {
            props.onChange();
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
                        onChange={option =>
                            setState(state => {
                                const newState = {
                                    ...state,
                                    steRegion: option
                                        ? { ...option }
                                        : undefined,
                                    sa4Region: undefined,
                                    sa3Region: undefined
                                };
                                onChange(newState);
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
                        onChange={option =>
                            setState(state => {
                                const newState = {
                                    ...state,
                                    sa4Region: option
                                        ? { ...option }
                                        : undefined,
                                    sa3Region: undefined
                                };
                                onChange(newState);
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
                                onChange(newState);
                                return newState;
                            })
                        }
                    />
                </div>
            </div>
        </div>
    );
};

export default RegionPanel;
