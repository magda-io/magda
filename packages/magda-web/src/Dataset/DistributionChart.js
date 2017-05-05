import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';
import { connect } from "react-redux";

class ResourcetChart extends Component {
  render(){
    return <div className="dataset-details container" >
                <h2>Chart</h2>
          </div>
  }
}

function mapStateToProps(state) {
  return {
  };
}



export default connect(mapStateToProps)(ResourcetChart);