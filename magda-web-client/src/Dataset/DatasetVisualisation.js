import React, { Component } from 'react';
import { connect } from 'react-redux';

class DatasetVisualisation extends Component {
  render(){
    const datasrc = this.props.dataset;
    debugger
    return <div className='dataset-details container' >

          </div>
  }
}

function mapStateToProps(state) {
  const record= state.record;
  const dataset = record.dataset;
  return {
    dataset
  };
}

export default connect(mapStateToProps)(DatasetVisualisation);
