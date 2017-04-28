import React from 'react';
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import { fetchDatasetFromRegistry, fetchDistributionFromRegistry } from "../actions/recordActions";
import Tabs from '../UI/Tabs';
import {config} from '../config';
import { Link } from 'react-router';

class RecordHandler extends React.Component {
  componentWillMount(){
    if(!this.props.params.distributionId){
      this.props.fetchDataset(this.props.params.datasetId);
    } else{
      this.props.fetchDistribution(this.props.params.distributionId);
    }
  }

  componentWillReceiveProps(nextProps){
    if(!nextProps.params.distributionId){
      if(!this.props.params.distributionId && (nextProps.params.datasetId !== this.props.params.datasetId)){
        nextProps.fetchDataset(nextProps.params.datasetId);
      } else if(this.props.params.distributionId){
        nextProps.fetchDataset(nextProps.params.datasetId);
      }
    } else if(nextProps.params.distributionId !== this.props.params.distributionId){
      nextProps.fetchDistribution(nextProps.params.distributionId);
    }
  }

  renderByState(){
    if(this.props.notFound){
      return <h2>Page not found</h2>;
    } else if(this.props.error){
      return <h2>error</h2>;
    } else if(this.props.params.distributionId){
      return (
        <div>
          <ul className="breadcrumb">
            <li className="breadcrumb-item"><Link to="#">Home</Link></li>
            <li className="breadcrumb-item"><Link to={`/dataset/${this.props.params.datasetId}`}>Dataset</Link></li>
          </ul>
            <h1>{this.props.distribution.title}</h1>
            <a>{this.props.distribution.downloadUrl}</a>
            <div>{this.props.distribution.updatedDate}</div>
            <Tabs list = {config.distributionTabList} baseUrl = {`/dataset/${this.props.params.datasetId}/distribution/${this.props.params.distributionId}`}/>
            <div>{this.props.children}</div>
            </div>
      )
    }
    return (
      <div>
          <h1>{this.props.dataset.title}</h1>
          <a>{this.props.dataset.landingPage}</a>
          <div>{this.props.dataset.updatedDate}</div>
          <Tabs list = {config.datasetTabList} baseUrl = {`/dataset/${this.props.params.datasetId}`}/>
          <div>{this.props.children}</div>
      </div>
    );
  }
  
  render() {
    return (
      <div>
          {this.renderByState()}
      </div>
    );
  }
}

function mapStateToProps(state) {
  const record=state.record;
  const dataset=record.dataset;
  const distribution=record.distribution;
  const isFetching=record.isFetching;
  const error=record.error;
  const notFound=record.notFound;

  return {
    dataset, distribution, isFetching, error, notFound
  };
}

function mapDispatchToProps(dispatch) {
  return bindActionCreators({
    fetchDataset: fetchDatasetFromRegistry,
    fetchDistribution: fetchDistributionFromRegistry
  }, dispatch);
}

RecordHandler.propTypes = {
  dataset: React.PropTypes.object,
  distribution: React.PropTypes.object,
  location: React.PropTypes.object.isRequired,
  isFetching: React.PropTypes.bool.isRequired,
  notFound: React.PropTypes.bool.isRequired,
  error: React.PropTypes.object
}

export default connect(mapStateToProps, mapDispatchToProps)(RecordHandler);




