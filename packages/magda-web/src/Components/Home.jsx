import React from 'react';
import {config} from '../config.js';



export default class Home extends React.Component {
  onSearchTextChange(){

  }
  render() {
    return (
      <div className="container">
        <h1>{config.appName}</h1>
      </div>
    );
  }
}




