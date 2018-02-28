import React from "react";
import "./DataPreviewTextBox.css";

function DataPreviewTextBox(props) {
    return (
        <div className="data-preview-text-box">
            <pre>{props.data.data}</pre>
        </div>
    );
}

export default DataPreviewTextBox;
