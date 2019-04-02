import React from "react";
import Editor from "./Editor";

export const bboxEditor: Editor = {
    edit: (value: any, onChange: Function) => {
        value = value || [-180.0, -90.0, 180.0, 90.0];
        const callback = (valueIndex, minValue, maxValue) => event => {
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
                value={value[valueIndex]}
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
                        <td>North: {editor(3, -90, 90)}</td>
                        <td />
                    </tr>
                    <tr>
                        <td>West: {editor(0, -180, 180)}</td>
                        <td />
                        <td>East: {editor(2, -180, 180)}</td>
                    </tr>
                    <tr>
                        <td />
                        <td>South: {editor(1, -90, 90)}</td>
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
