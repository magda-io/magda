import React, { Component } from 'react';
import defined from '../helpers/defined';
import MarkdownViewer from '../UI/MarkdownViewer';
import Star from '../UI/Star';
import { Link } from 'react-router';
import { connect } from "react-redux";

class DistributionDetails extends Component {
  
  render(){
    return <div className="dataset-details container" >
                <h2>{this.props.distribution.description}</h2>
          </div>
  }
}

function mapStateToProps(state) {
  const distribution = state.record.distribution;
  return {
    distribution
  };
}



export default connect(mapStateToProps)(DistributionDetails);