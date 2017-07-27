import React, { Component } from 'react';
import JSONTree from 'react-json-tree'

class DataPreviewJson extends Component {
    render(){
      return <div className='data-preview-json'>
               <JSONTree data={this.props.data} />
             </div>
    }
}


export default DataPreviewJson;
