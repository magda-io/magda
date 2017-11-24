import React, { Component } from 'react';
import { connect } from 'react-redux';

function ResourcetChart(props) {
  return <div className='dataset-details container' >
              <h2>Chart</h2>
        </div>
}

function mapStateToProps(state) {
  return {
  };
}



export default connect(mapStateToProps)(ResourcetChart);