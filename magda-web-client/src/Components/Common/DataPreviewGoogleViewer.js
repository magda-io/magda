import React from "react";

function DataPreviewGoogleViewer({ distribution }) {
    return (
        <div className="data-preview-json">
            <iframe
                title="google doc viewer"
                allowFullScreen=""
                height="600px"
                scrolling="auto"
                src={`https://docs.google.com/viewer?embedded=true&toolbar=hide&url=${distribution.downloadURL}`}
                width="100%"
            />
        </div>
    );
}

export default DataPreviewGoogleViewer;
