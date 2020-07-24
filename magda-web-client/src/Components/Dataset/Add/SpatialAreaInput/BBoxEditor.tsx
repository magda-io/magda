import React, { useState, FunctionComponent, ChangeEvent } from "react";
import compassIcon from "assets/compass.svg";
import editIcon from "assets/edit.svg";
import { BoundingBox } from "helpers/datasetSearch";

interface PropsType {
    bbox?: BoundingBox;
    onChange?: (bbox?: BoundingBox) => void;
}

interface StateType {
    west: string;
    south: string;
    east: string;
    north: string;
}

const initialState: StateType = {
    west: "",
    south: "",
    east: "",
    north: ""
};

type ValueKeyType = "west" | "south" | "north" | "east";

const VALUE_KEY_TYPES = ["west", "south", "east", "north"] as ValueKeyType[];

const convertStringToCoordinator: (
    str: string,
    valueKey: ValueKeyType
) => number | undefined = (str, valueKey) => {
    const min = valueKey === "east" || valueKey === "west" ? -180 : -90;
    const max = valueKey === "east" || valueKey === "west" ? 180 : 90;
    try {
        const number = parseFloat(str.trim());
        if (isNaN(number)) return undefined;
        if (number > max || number < min) return undefined;
        return number;
    } catch (e) {
        return undefined;
    }
};

const isDefined = (obj: any, key: string) => typeof obj[key] !== "undefined";

const createBboxFromStateProps: (
    state: StateType,
    props: PropsType
) => BoundingBox = (state, props) => {
    const bbox: any = {};

    VALUE_KEY_TYPES.forEach((valueKey: ValueKeyType) => {
        const value = convertStringToCoordinator(state[valueKey], valueKey);
        bbox[valueKey] = value;
    });

    return bbox;
};

const roundNumber = (value: number) => {
    return Math.round(value * 10000) / 10000;
};

const BBoxEditor: FunctionComponent<PropsType> = (props) => {
    const [state, setState] = useState<StateType>(initialState);

    const onChange = (valueKey: string, props: PropsType) => (
        event: ChangeEvent<HTMLInputElement>
    ) => {
        const value = event.currentTarget.value;
        setState((state) => {
            const newState = {
                ...state,
                [valueKey]: value
            };

            const bbox = createBboxFromStateProps(newState, props);
            if (
                typeof props.onChange === "function" &&
                Object.keys(bbox).filter((key) => typeof bbox === "undefined")
                    .length === 0
            ) {
                // --- can produce an valid bbox
                props.onChange(bbox);
            }

            return newState;
        });
    };

    (() => {
        const newState = { ...state };
        let isStateUpdated = false;
        if (props.bbox) {
            VALUE_KEY_TYPES.forEach((valueKey) => {
                if (
                    state[valueKey].trim() === "" &&
                    isDefined(props.bbox, valueKey)
                ) {
                    isStateUpdated = true;
                    newState[valueKey] = roundNumber(
                        (props.bbox as BoundingBox)[valueKey]
                    ).toString();
                }
            });
        }
        if (!isStateUpdated) return;
        setState(newState);
    })();

    return (
        <div className="bbox-editor-container">
            <img className="edit-button" src={editIcon} alt="edit button" />
            <table>
                <tbody>
                    <tr>
                        <td />
                        <td>
                            <p>North Bounding Latitude</p>
                            <input
                                type="number"
                                className="au-text-input bbox-input"
                                value={state.north}
                                min={-90}
                                max={90}
                                step="any"
                                onChange={onChange("north", props)}
                            />
                        </td>
                        <td />
                    </tr>
                    <tr>
                        <td>
                            <p>West Bounding Longitude</p>
                            <input
                                type="number"
                                className="au-text-input bbox-input"
                                value={state.west}
                                min={-180}
                                max={180}
                                step="any"
                                onChange={onChange("west", props)}
                            />
                        </td>
                        <td className="compass-icon-container">
                            <img src={compassIcon} alt="compass icon" />
                        </td>
                        <td>
                            <p>East Bounding Longitude</p>
                            <input
                                type="number"
                                className="au-text-input bbox-input"
                                value={state.east}
                                min={-180}
                                max={180}
                                step="any"
                                onChange={onChange("east", props)}
                            />
                        </td>
                    </tr>
                    <tr>
                        <td />
                        <td>
                            <p>South Bounding Latitude</p>
                            <input
                                type="number"
                                className="au-text-input bbox-input"
                                value={state.south}
                                min={-90}
                                max={90}
                                step="any"
                                onChange={onChange("south", props)}
                            />
                        </td>
                        <td />
                    </tr>
                </tbody>
            </table>
        </div>
    );
};

export default BBoxEditor;
