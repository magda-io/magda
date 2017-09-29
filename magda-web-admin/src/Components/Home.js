// @flow
import React from 'react';
import {config} from '../config'
import ReactDocumentTitle from 'react-document-title';
import './Home.css';

export default class Home extends React.Component {
  render() {
    return (
      <ReactDocumentTitle title={'Welcome | ' + config.appName}>
      <div className='container home'>
        Home
      </div>
      </ReactDocumentTitle>
    );
  }
};
