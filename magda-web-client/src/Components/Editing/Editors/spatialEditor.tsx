import React from "react";
import Editor from "./Editor";

import CompassIcon from "assets/compass.svg";

export const bboxEditor: Editor<[number, number, number, number]> = {
    edit: (value: any, onChange: Function) => {
        value = value || [-180.0, -90.0, 180.0, 90.0];
        const strValues = value.map((v) => v.toString());
        const callback = (valueIndex, minValue, maxValue) => (event) => {
            value[valueIndex] = Math.min(
                Math.max(parseFloat(event.target.value), minValue),
                maxValue
            );
            onChange(value);
        };
        const editor = (valueIndex, minValue, maxValue) => (
            <input
                type="number"
                className="au-text-input"
                defaultValue={strValues[valueIndex]}
                min={minValue}
                max={maxValue}
                step="any"
                onChange={callback(valueIndex, minValue, maxValue)}
            />
        );
        return (
            <table>
                <tbody>
                    <tr>
                        <td />
                        <td>
                            <p>North Bounding Latitude</p>
                            {editor(3, -90, 90)}
                        </td>
                        <td />
                    </tr>
                    <tr>
                        <td>
                            <p>West Bounding Longitude</p>
                            {editor(0, -180, 180)}
                        </td>
                        <td
                            style={{
                                textAlign: "center"
                            }}
                        >
                            <img
                                src={CompassIcon}
                                style={{
                                    width: "10em",
                                    verticalAlign: "middle"
                                }}
                            />
                        </td>
                        <td>
                            <p>East Bounding Longitude</p>
                            {editor(2, -180, 180)}
                        </td>
                    </tr>
                    <tr>
                        <td />
                        <td>
                            <p>South Bounding Latitude</p>
                            {editor(1, -90, 90)}
                        </td>
                        <td />
                    </tr>
                </tbody>
            </table>
        );
    },
    view: (value: any) => {
        if (!value) {
            return <React.Fragment>[NOT SET]</React.Fragment>;
        }
        return (
            <table>
                <tbody>
                    <tr>
                        <td />
                        <td>North: {value[3]}</td>
                        <td />
                    </tr>
                    <tr>
                        <td>West: {value[0]}</td>
                        <td />
                        <td>East: {value[2]}</td>
                    </tr>
                    <tr>
                        <td />
                        <td>South: {value[1]}</td>
                        <td />
                    </tr>
                </tbody>
            </table>
        );
    }
};
