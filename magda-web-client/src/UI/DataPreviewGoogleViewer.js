import React, { Component } from "react";

<<<<<<< HEAD
function DataPreviewGoogleViewer(props) {
  console.log(props.data.data)
  return (
      <div className='data-preview-json'>
      <iframe allowFullScreen="" height="600px" scrolling="auto" src={`https://docs.google.com/viewer?embedded=true&toolbar=hide&url=${props.data.data}`} width="100%"></iframe>
             </div>
  );
=======
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
>>>>>>> master
}

export default DataPreviewGoogleViewer;
