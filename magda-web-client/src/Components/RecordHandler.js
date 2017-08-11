// @flow
import React from 'react';
import { connect } from 'react-redux';
import ReactDocumentTitle from 'react-document-title';
import { bindActionCreators } from 'redux';
import { fetchDatasetFromRegistry, fetchDistributionFromRegistry } from '../actions/recordActions';
import Tabs from '../UI/Tabs';
import {config} from '../config';
import { Link } from 'react-router';
import ErrorHandler from '../Components/ErrorHandler';
import CustomIcons from '../UI/CustomIcons';
import type {StateRecord } from '../types';
import type { ParsedDataset, ParsedDistribution } from '../helpers/record';

class RecordHandler extends React.Component {
  props: {
    distributionFetchError: number,
    datasetFetchError: number,
    children: React$Element<any>,
    fetchDataset: Function,
    fetchDistribution: Function,
    dataset: ParsedDataset,
    distribution: ParsedDistribution,
    params: {
      datasetId: string,
      distributionId? : string
    }
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

  renderBreadCrumbs(dataset: ParsedDataset, distribution? :ParsedDistribution){
    return (
    <ul className='breadcrumb'>
      <li className='breadcrumb-item'><Link to='#'>Home</Link></li>
      <li className='breadcrumb-item'>{distribution ? <Link to={`/dataset/${encodeURIComponent(dataset.identifier)}`}>{dataset.title}</Link>:dataset.title}</li>
      {distribution && <li className='breadcrumb-item'>{distribution.title}</li>}
    </ul>)
  }

  renderByState(){
    const publisherName = this.props.dataset.publisher.name;
    const publisherLogo = (this.props.dataset.publisher && this.props.dataset.publisher['aspects']['organization-details']) ? this.props.dataset.publisher['aspects']['organization-details']['imageUrl'] : '';
    const publisherId = this.props.dataset.publisher ? this.props.dataset.publisher.id : null;
    const distributionIdAsUrl = this.props.params.distributionId ? encodeURIComponent(this.props.params.distributionId) : '';
     if (this.props.params.distributionId && !this.props.distributionIsFetching){
       if(this.props.distributionFetchError){
         return <ErrorHandler errorCode={this.props.distributionFetchError}/>;
       }
       const tabList = [
         {id: 'details', name: 'Details', isActive: true},
         {id: 'preview', name: 'Preview', isActive: true}
       ]
      return (
        <div>
          <div className='container'>
            {this.renderBreadCrumbs(this.props.dataset, this.props.distribution)}
              <div className='media'>
                <div className='media-left'>
                  <CustomIcons imageUrl={publisherLogo}/>
                </div>
                <div className='media-body'>
                  <h1>{this.props.distribution.title}</h1>
                  <div className='publisher'>{publisherName}</div>
                  <div className='updated-date'>Updated {this.props.distribution.updatedDate}</div>
                </div>
              </div>
            </div>
            <Tabs list={tabList} baseUrl={`/dataset/${encodeURIComponent(this.props.params.datasetId)}/distribution/${distributionIdAsUrl}`}/>
            <div className='tab-content'>{this.props.children}</div>
            </div>
      )
    } else if(this.props.params.datasetId && !this.props.datasetIsFetching){
      if(this.props.datasetFetchError){
        return <ErrorHandler errorCode={this.props.datasetFetchError}/>;
      }
      const datasetTabs = [
        {id: 'details', name: 'Details', isActive: true},
        {id:  'discussion', name: 'Discussion', isActive: !config.disableAuthenticationFeatures},
        {id: 'publisher', name: 'About ' + publisherName, isActive: publisherId},
      ];
      return (
        <div>

            <div className='container media'>
              {this.renderBreadCrumbs(this.props.dataset)}
              <div className='media-left'>
                <CustomIcons imageUrl={publisherLogo}/>
              </div>
               <div className='media-body'>
                  <h1>{this.props.dataset.title}</h1>
                  <div className='publisher'>{publisherName}</div>
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
  const distributionFetchError= record.distributionFetchError;

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
