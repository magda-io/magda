import React, { Component } from "react";

class DataPreviewGoogleViewer extends Component {
  render() {
    console.log(this.props.data.data);
    return (
      <div className="data-preview-json">
        <iframe
          title="googledocsviewer"
          allowFullScreen=""
          height="600px"
          scrolling="auto"
          src={`https://docs.google.com/viewer?embedded=true&toolbar=hide&url=${this
            .props.data.data}`}
          width="100%"
        />
      </div>
    );
  }
}

export default DataPreviewGoogleViewer;
