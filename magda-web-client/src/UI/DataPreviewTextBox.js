import React, { Component } from 'react';
import OverviewBox from './OverviewBox';
import MarkdownViewer from '../UI/MarkdownViewer';
import './DataPreviewTextBox.css';
class DataPreviewTextBox extends Component {
    render(){
      return <div className='data-preview-text-box'>
              <MarkdownViewer markdown={this.props.data.data}/ >
             </div>
    }
}


export default DataPreviewTextBox;
