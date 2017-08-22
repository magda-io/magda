<<<<<<< HEAD
import React, { Component } from 'react';
import OverviewBox from './OverviewBox';
import './DataPreviewTextBox.css';

function DataPreviewTextBox(props) {
  return (
      <div className='data-preview-text-box'>
              <pre>{props.data.data}</pre>
             </div>
  );
=======
import React, { Component } from "react";
import "./DataPreviewTextBox.css";
class DataPreviewTextBox extends Component {
  render() {
    return (
      <div className="data-preview-text-box">
        <pre>
          {this.props.data.data}
        </pre>
      </div>
    );
  }
>>>>>>> master
}

export default DataPreviewTextBox;
