// @flow
import React, { Component } from 'react';

import TemporalAspectViewer from '../UI/TemporalAspectViewer';
import SpatialAspectViewer from '../UI/SpatialAspectViewer';
import OverviewBox from '../UI/OverviewBox';
import CustomIcons from '../UI/CustomIcons';
import Social from '../Components/Social';
import { Link } from 'react-router';
import { connect } from 'react-redux';
import renderDistribution from '../UI/Distribution';
import './RecordDetails.css';

class DatasetDetails extends Component {


  render(){
    const dataset = this.props.dataset;
    const datasetId = this.props.params.datasetId;
    return <div className='dataset-details container'>
              <div className='row'>
                <div className='dataset-details__body col-sm-8'>
                  <div className='dataset-details-overview'>
                    <h3 className='section-heading'>Overview</h3>
                    <OverviewBox content={dataset.description}/>
                  </div>

                  <div className='dataset-details-source'>
                      <h3 className='section-heading'>Data and APIs</h3>
                      <div className='white-box'>{
                        dataset.source && dataset.source.map(s=> renderDistribution(s.format, s.id, s.title, s.license, datasetId))
                      }</div>
                  </div>
                  <div className='dataset-details-spatial-coverage'>
                      <h3 className='section-heading'>Spatial coverage</h3>
                      <SpatialAspectViewer data={dataset.spatialCoverage}/>
                  </div>
                  <div className='dataset-details-temporal-coverage'>
                      <h3 className='section-heading'>Temporal coverage</h3>
                      <TemporalAspectViewer data={dataset.temporalCoverage}/>
                  </div>
              </div>

              <div className='record-details__sidebar col-sm-4'>
                  <div><Link to={`project/new?dataset=${datasetId}`} className='btn btn-primary'>Add to project</Link></div>
                  <Social/>
                  <div className='tags'>
                    <h5>Tags</h5>
                    {dataset.tags && dataset.tags.map(t=><Link className='badge' key={t} to={`/search?q=${encodeURIComponent(t)}`}>{t}</Link>)}
                  </div>
              </div>
              </div>
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

export default connect(mapStateToProps)(DatasetDetails);
