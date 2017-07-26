import React, { Component } from 'react';


class DataPreviewGoogleViewer extends Component {

    render(){
      console.log(this.props.data.data)
      return <div className='data-preview-json'>
      <iframe allowFullScreen="" height="600px" scrolling="auto" src={`https://docs.google.com/viewer?embedded=true&toolbar=hide&url=${this.props.data.data}`} width="100%"></iframe>
             </div>
    }
}


export default DataPreviewGoogleViewer;
