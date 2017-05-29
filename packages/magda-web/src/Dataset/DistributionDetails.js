import React, { Component } from 'react';
import { connect } from "react-redux";

import TemporalAspectViewer from '../UI/TemporalAspectViewer';
import SpatialAspectViewer from '../UI/SpatialAspectViewer';
import OverviewBox from '../UI/OverviewBox';
import CustomIcons from '../UI/CustomIcons';
import Social from '../Components/Social';
import { Link } from 'react-router';
import './RecordDetails.css';


class DistributionDetails extends Component {
  render(){
    const distribution = this.props.distribution;
    return <div className="distribution-details container" >
                <div className="row">
                <div className='distribution-details__body col-sm-8'>
                  <div className='distribution-details-overview'>
                    <h3>Overview</h3>
                    <OverviewBox content={distribution.description}/>
                  </div>

                  <div className="distribution-details-spatial-coverage">
                      <h3>Spatial coverage</h3>
                      <SpatialAspectViewer data={distribution.spatialCoverage}/>
                  </div>
                  <div className="distribution-details-temporal-coverage">
                      <h3>Temporal coverage</h3>
                      <TemporalAspectViewer data={distribution.temporalCoverage}/>
                  </div>
              </div>

              <div className='record-details__sidebar col-sm-4'>
                  <div><button className='btn btn-primary'>Add to project</button></div>
                  <Social/>
                  <div className="tags">
                    <h5>Tags</h5>
                    {distribution.tags && distribution.tags.map(t=><Link className="badge" key={t} to={`/search?q=${encodeURIComponent(t)}`}>{t}</Link>)}
                  </div>
              </div>
              </div>
                
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

