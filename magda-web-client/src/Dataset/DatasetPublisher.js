import React, { Component } from 'react';
import { connect } from 'react-redux';
import { Link } from 'react-router';
import OverviewBox from '../UI/OverviewBox';

class DatasetPublisher extends Component {
  renderPublisher(publisherName, publisherDetails){
    debugger
      return (<div className='col-sm-8'>
                <h2>{publisherName}</h2>
                <h3 className='section-heading'>Overview</h3>
                <OverviewBox content={publisherDetails.description}/>
                <Link to={`/search?publisher=${encodeURIComponent(publisherName)}&q=${encodeURIComponent('*')}`}>View all datasets from {publisherName}</Link>
              </div>)
  }

  render(){
    return <div className='dataset-publisher container' >
            <div className='row'>
                {this.props.dataset.publisher && this.renderPublisher(this.props.dataset.publisher, this.props.dataset.publisherDetails)}
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

export default connect(mapStateToProps)(DatasetPublisher);
