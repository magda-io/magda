import React from 'react';
import ReactDocumentTitle from 'react-document-title';
import {config} from '../config.js';

export default class Feedback extends React.Component {
  render() {
    return (
    <ReactDocumentTitle title={config.appName + ' | feedback'}>
      <div className='container feedback'>
        <h1>Feedback</h1>
        <a href="http://preview.data.gov.au/feedback.html" rel="noopener noreferrer" target="_blank">Give us feedback</a>
      </div>
      </ReactDocumentTitle>
    );
  }
}
