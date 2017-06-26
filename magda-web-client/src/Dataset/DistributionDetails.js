import React, { Component } from 'react';
import { connect } from 'react-redux';

import TemporalAspectViewer from '../UI/TemporalAspectViewer';
import SpatialAspectViewer from '../UI/SpatialAspectViewer';
import OverviewBox from '../UI/OverviewBox';
import Social from '../Components/Social';
import { Link } from 'react-router';
import './RecordDetails.css';


class DistributionDetails extends Component {
  render(){
    const distribution =this.props.distribution;
    return <div className='distribution-details container' >
                <div className='row'>
                <div className='distribution-details__body col-sm-8'>
                  <div className='distribution-details-overview'>
                    <h3>Overview</h3>
                    <OverviewBox content={distribution.description}/>
                  </div>
                  <div className='distribution-details-temporal-coverage'>
                      <h3>Temporal coverage</h3>
                      <TemporalAspectViewer data={distribution.temporalCoverage}/>
                  </div>
              </div>

              <div className='record-details__sidebar col-sm-4'>
                  <Social/>
              </div>
              </div>

          </div>
  }
}

function mapStateToProps(state) {
  const distribution =state.record.distribution;
  return {
    distribution
  };
}



export default connect(mapStateToProps)(DistributionDetails);
