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
    steRegion?: Region;
    sa4Region?: Region;
    sa3Region?: Region;
    onChange?: () => void;
}

export type OptionType = Region;

const initialState = props => ({
    steRegion: props.steRegion,
    sa4Region: props.sa4Region,
    sa3Region: props.sa3Region
});

const RegionPanel: FunctionComponent<PropsType> = props => {
    const [state, setState] = useState<StateType>(initialState(props));
    console.log(state);
    return (
        <div className="region-panel">
            <div className="row">
                <div className="col-sm-3 state-select-container">
                    <div className="state-select-heading">State</div>
                    <StateSelect
                        value={state.steRegion}
                        onChange={option =>
                            setState(state => ({
                                ...state,
                                steRegion: option ? { ...option } : option,
                                sa4Region: undefined,
                                sa3Region: undefined
                            }))
                        }
                    />
                </div>
                <div className="col-sm-9 region-select-container">
                    <div className="region-select-heading">
                        Region (ABS SA4) <span>(optional)</span>
                    </div>
                    <RegionSelect
                        value={state.sa4Region}
                        steRegion={state.steRegion}
                        onChange={option =>
                            setState(state => ({
                                ...state,
                                sa4Region: option ? { ...option } : option,
                                sa3Region: undefined
                            }))
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
                        steRegion={state.steRegion}
                        sa4Region={state.sa4Region}
                        onChange={option =>
                            setState(state => ({
                                ...state,
                                sa3Region: option ? { ...option } : option
                            }))
                        }
                    />
                </div>
            </div>
        </div>
    );
};

export default RegionPanel;
