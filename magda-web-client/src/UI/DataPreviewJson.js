import React, { Component } from 'react';
import JSONTree from 'react-json-tree'

function DataPreviewJson(props) {
  return (
    <div className='data-preview-json'>
             <JSONTree data={props.data} />
           </div>
  );
}


export default DataPreviewJson;
