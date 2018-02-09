import React, { Component } from 'react';
import { connect } from 'react-redux';
import TemporalAspectViewer from '../../UI/TemporalAspectViewer';
import OverviewBox from '../../UI/OverviewBox';
import Social from '../../Components/Social';
import './RecordDetails.css';


class DistributionDetails extends Component {
  renderLinkStatus(linkStatusAvailable, linkActive){
    if(linkStatusAvailable && !linkActive){
      return '(This link appears to be broken)'
    }
    return '';
  }

  renderLinkText(distribution){
    const downloadText = distribution.downloadURL ? `This dataset can be downloaded from: \n\n ${distribution.downloadURL} ${this.renderLinkStatus(distribution.linkStatusAvailable, distribution.linkActive)}` : '';
    const accessText = distribution.accessUrl ? `This dataset can be accessed from: \n\n ${distribution.accessUrl}` : '';
    return downloadText + accessText;
  }

  render(){
    const distribution =this.props.distribution;
    return <div className='distribution-details container' >
                <div className='row'>
                <div className='distribution-details__body col-sm-8'>
                  <div className='distribution-details-overview'>
                    <h3>Overview</h3>
                    <OverviewBox content={distribution.description}/>
                    {this.renderLinkText(distribution).length > 0 &&
                      (<div> <h3>Download</h3>
                       <OverviewBox content={this.renderLinkText(distribution)}/>
                      </div>)
                    }
                  </div>
                  <div className='distribution-details-temporal-coverage'>
                      <h3>Temporal coverage</h3>
                      <TemporalAspectViewer data={distribution.temporalCoverage}/>
                  </div>
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
