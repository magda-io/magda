import React, { Component } from 'react';
import TemporalAspectViewer from '../../UI/TemporalAspectViewer';
import OverviewBox from '../../UI/OverviewBox';
import Social from '../../Components/Social';
import { Link } from 'react-router-dom';
import { connect } from 'react-redux';
import renderDistribution from '../../Components/Distribution';
import './RecordDetails.css';
import Button from 'muicss/lib/react/button';

class DatasetDetails extends Component{
  state={
    showPreview: false
  }
  render(){
    const dataset = this.props.dataset;
    const datasetId = this.props.match.params.datasetId;

    const source = `This dataset was originally found on ${this.props.dataset.source}: \n\n  ${dataset.landingPage}`
    return <div className='dataset-details container'>
              <div className='mui-row'>
                <div className='dataset-details__body mui-col-sm-8'>
                  <div className='dataset-details-overview'>
                    <h3 className='section-heading'>Overview</h3>
                    <OverviewBox content={dataset.description}/>
                  </div>
                  <div className='dataset-details-source'>
                    <h3 className='section-heading'>Source</h3>
                    <OverviewBox content={source}/>
                  </div>
                  <div className='dataset-details-source'>
                      <h3 className='clearfix'><span className='section-heading'>Data and APIs</span><Button onClick={()=>this.setState({showPreview: !this.state.showPreview})}>{this.state.showPreview ? 'close preview' : 'show preview'}</Button></h3>
                      <div className='clearfix'>{dataset.distributions.map(s=> renderDistribution(s, datasetId, this.state.showPreview))}</div>
                  </div>
                  <div className='dataset-details-temporal-coverage'>
                      <h3 className='section-heading'>Temporal coverage</h3>
                      <TemporalAspectViewer data={dataset.temporalCoverage}/>
                  </div>
              </div>

            <div className='record-details__sidebar mui-col-sm-4'>
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
