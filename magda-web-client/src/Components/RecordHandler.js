// @flow
import React from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { fetchDatasetFromRegistry, fetchDistributionFromRegistry } from '../actions/recordActions';
import Tabs from '../UI/Tabs';
import {config} from '../config';
import { Link } from 'react-router';
import ErrorHandler from '../Components/ErrorHandler';
import ReactDocumentTitle from 'react-document-title';
import CustomIcons from '../UI/CustomIcons';
import type {StateRecord } from '../types';

class RecordHandler extends React.Component {
  props: {
    distributionFetchError: number,
    datasetFetchError: number,
    children: React$Element<any>,
    fetchDataset: Function,
    fetchDistribution: Function
  }
  componentWillMount(){
    this.props.fetchDataset(this.props.params.datasetId);
    if(this.props.params.distributionId){
      this.props.fetchDistribution(this.props.params.distributionId);
    }
  }
  componentWillReceiveProps(nextProps){
      if(nextProps.params.datasetId !== this.props.params.datasetId){
        nextProps.fetchDataset(nextProps.params.datasetId);
      }
      if(nextProps.params.distributionId && nextProps.params.distributionId !== this.props.params.distributionId){
        nextProps.fetchDistribution(nextProps.params.distributionId);
      }
  }

  renderByState(){
     if (this.props.params.distributionId && !this.props.distributionIsFetching){
       if(this.props.distributionFetchError){
         return <ErrorHandler errorCode={this.props.distributionFetchError}/>;
       }
       const tabList = [
         {id: 'details', name: 'Details', isActive: true},
         {id: 'map', name: 'Maps', isActive: this.props.distribution.format && (this.props.distribution.format.toLowerCase() === 'wms' || this.props.distribution.format.toLowerCase() === 'wfs')},
         {id: 'chart', name: 'Chart', isActive: this.props.distribution.format && (this.props.distribution.format.toLowerCase() === 'csv' || this.props.distribution.format.toLowerCase() === 'json')}
       ]
      return (
        <div>
          <div className='container'>
              <ul className='breadcrumb'>
                <li className='breadcrumb-item'><Link to='#'>Home</Link></li>
                <li className='breadcrumb-item'><Link to={`/dataset/${encodeURIComponent(this.props.params.datasetId)}`}>Dataset</Link></li>
                <li className='breadcrumb-item'>Distribution</li>
              </ul>
              <div className='media'>
                <div className='media-left'>
                  <CustomIcons imageUrl={this.props.dataset.publisherDetails && this.props.dataset.publisherDetails.imageUrl}/>
                </div>
                <div className='media-body'>
                  <h1>{this.props.distribution.title}</h1>
                  <div className='publisher'>{this.props.dataset.publisher}</div>
                  <div className='updated-date'>Updated {this.props.distribution.updatedDate}</div>
                </div>
              </div>
            </div>
            <Tabs list={tabList} baseUrl={`/dataset/${encodeURIComponent(this.props.params.datasetId)}/distribution/${encodeURIComponent(this.props.params.distributionId)}`}/>
            <div className='tab-content'>{this.props.children}</div>
            </div>
      )
    } else if(this.props.params.datasetId && !this.props.datasetIsFetching){
      if(this.props.datasetFetchError){
        return <ErrorHandler errorCode={this.props.error}/>;
      }
      const datasetTabs = [
        {id: 'details', name: 'Details', isActive: true},
        {id:  'discussion', name: 'Discussion', isActive: !config.disableAuthenticationFeatures},
        {id: 'publisher', name: 'About ' + this.props.dataset.publisher, isActive: this.props.dataset.publisher}
      ];
      return (
        <div>
            <div className='container media'>
              <div className='media-left'>
                <CustomIcons imageUrl={this.props.dataset.publisherDetails && this.props.dataset.publisherDetails.imageUrl}/>
              </div>
               <div className='media-body'>
                  <h1>{this.props.dataset.title}</h1>
                  <div className='publisher'>{this.props.dataset.publisher}</div>
                  <div className='updated-date'>Updated {this.props.dataset.updatedDate}</div>
              </div>
            </div>
            <Tabs list={datasetTabs} baseUrl={`/dataset/${encodeURIComponent(this.props.params.datasetId)}`}/>
            <div className='tab-content'>{this.props.children}</div>
        </div>
      );
    }

  }

  render() {
    const title = this.props.params.distributionId ? this.props.distribution.title : this.props.dataset.title;
    return (
      <ReactDocumentTitle title={title + '|' + config.appName}>
        <div>
            {!this.props.isFetching && this.renderByState()}
        </div>
      </ReactDocumentTitle>
    );
  }
}




function mapStateToProps(state: {record: StateRecord}) {
  const record = state.record;
  const dataset =record.dataset;
  const distribution =record.distribution;
  const datasetIsFetching =record.datasetIsFetching;
  const distributionIsFetching = record.distributionIsFetching;
  const datasetFetchError = record.datasetFetchError;
  const distributionFetchError= record.distributionFetchError

  return {
    dataset, distribution, datasetIsFetching, distributionIsFetching, distributionFetchError, datasetFetchError
  };
}

const  mapDispatchToProps = (dispatch: Dispatch<*>) => {
  return bindActionCreators({
    fetchDataset: fetchDatasetFromRegistry,
    fetchDistribution: fetchDistributionFromRegistry
  }, dispatch);
}
export default connect(mapStateToProps, mapDispatchToProps)(RecordHandler);
