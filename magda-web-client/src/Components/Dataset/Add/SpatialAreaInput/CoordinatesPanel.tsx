import React, { FunctionComponent } from "react";
import BBoxEditor from "./BBoxEditor";
import SpatialDataPreviewer from "./SpatialDataPreviewer";
import { BoundingBox } from "helpers/datasetSearch";

interface PropsType {
    bbox?: BoundingBox;
    onChange?: (bbox?: BoundingBox) => void;
}

const CoordinatesPanel: FunctionComponent<PropsType> = (props) => {
    return (
        <div className="coordinates-panel">
            <div className="editor-heading">Map preview:</div>
            <div className="row">
                <div className="col-sm-6">
                    <BBoxEditor bbox={props.bbox} onChange={props.onChange} />
                </div>
                <div className="col-sm-6">
                    <SpatialDataPreviewer bbox={props.bbox} />
                </div>
            </div>
        </div>
    );
};

export default CoordinatesPanel;
