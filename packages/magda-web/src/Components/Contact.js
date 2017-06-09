import React from 'react';
import ReactDocumentTitle from 'react-document-title';
import {config} from '../config.js';


export default class Contact extends React.Component {
  render() {
    return (
    <ReactDocumentTitle title={config.appName + ' | contact'}>
      <div className='container contact'>
        <h1>Contacts</h1>
      </div>
      </ReactDocumentTitle>
    );
  }
}




