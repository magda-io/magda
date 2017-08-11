import React, { Component } from 'react';
import OverviewBox from './OverviewBox';
import './DataPreviewTextBox.css';

function DataPreviewTextBox(props) {
  return (
      <div className='data-preview-text-box'>
              <pre>{props.data.data}</pre>
             </div>
  );
}


export default DataPreviewTextBox;
