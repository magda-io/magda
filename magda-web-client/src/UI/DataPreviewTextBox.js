import React, { Component } from 'react';
import OverviewBox from './OverviewBox';
import './DataPreviewTextBox.css';
class DataPreviewTextBox extends Component {
    render(){
      return <div className='data-preview-text-box'>
              <pre>{this.props.data.data}</pre>
             </div>
    }
}


export default DataPreviewTextBox;
