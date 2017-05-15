import React, { Component } from 'react';
import { connect } from "react-redux";

class ResourcetMap extends Component {
  render(){
    return <div className="dataset-details container" >
                <h2>Map</h2>
          </div>
  }
}

function mapStateToProps(state) {
  return {
  };
}

export default connect(mapStateToProps)(ResourcetMap);