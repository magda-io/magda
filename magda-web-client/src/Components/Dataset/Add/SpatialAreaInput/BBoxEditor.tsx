import React from "react";
import compassIcon from "assets/compass.svg";
import editIcon from "assets/edit.svg";

const BBoxEditor = props => {
    const editor = (valueIndex, minValue, maxValue) => (
        <input
            type="number"
            className="au-text-input"
            defaultValue={"1"}
            min={minValue}
            max={maxValue}
            step="any"
            onChange={() => {}}
        />
    );

    return (
        <div className="bbox-editor-container">
            <img className="edit-button" src={editIcon} />
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
                        <td className="compass-icon-container">
                            <img src={compassIcon} />
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
        </div>
    );
};

export default BBoxEditor;
