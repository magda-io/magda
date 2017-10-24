// @flow
import React from 'react';
import { connect } from 'react-redux';
import ReactDocumentTitle from 'react-document-title';
import { bindActionCreators } from 'redux';
import { fetchDatasetFromRegistry, fetchDistributionFromRegistry } from '../actions/recordActions';
import Tabs from '../UI/Tabs';
import {config} from '../config';
import ErrorHandler from './ErrorHandler';
import CustomIcons from '../UI/CustomIcons';
import type {StateRecord } from '../types';
import type { ParsedDataset, ParsedDistribution } from '../helpers/record';
import {
  Route,
  Link,
  Switch
} from 'react-router-dom';
import DatasetDetails from './Dataset/DatasetDetails';
import DatasetDiscussion from './Dataset/DatasetDiscussion';
import DatasetPublisher from './Dataset/DatasetPublisher';
import DistributionDetails from './Dataset/DistributionDetails';
import DistributionPreview from './Dataset/DistributionPreview';

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
    this.props.fetchDataset(this.props.match.params.datasetId);
    if(this.props.match.params.distributionId){
      this.props.fetchDistribution(this.props.match.params.distributionId);
    }
  }
  componentWillReceiveProps(nextProps){
      if(nextProps.match.params.datasetId !== this.props.match.params.datasetId){
        nextProps.fetchDataset(nextProps.match.params.datasetId);
      }
      if(nextProps.match.params.distributionId && nextProps.match.params.distributionId !== this.props.match.params.distributionId){
        nextProps.fetchDistribution(nextProps.match.params.distributionId);
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
    debugger
    const publisherName = this.props.dataset.publisher.name;
    const publisherLogo = (this.props.dataset.publisher && this.props.dataset.publisher['aspects']['organization-details']) ? this.props.dataset.publisher['aspects']['organization-details']['imageUrl'] : '';
    const publisherId = this.props.dataset.publisher ? this.props.dataset.publisher.id : null;
    const distributionIdAsUrl = this.props.match.params.distributionId ? encodeURIComponent(this.props.match.params.distributionId) : '';
     if (this.props.match.params.distributionId && !this.props.distributionIsFetching){
       if(this.props.distributionFetchError){
         return <ErrorHandler errorCode={this.props.distributionFetchError}/>;
       }
       const tabList = [
         {id: 'details', name: 'Details', isActive: true},
         {id: 'preview', name: 'Preview', isActive: true}
       ];
       const baseUrl = `/dataset/${encodeURIComponent(this.props.match.params.datasetId)}/distribution/${distributionIdAsUrl}`
      return (
        <div>
          <div className='container'>
            {this.renderBreadCrumbs(this.props.dataset, this.props.distribution)}
              <div className='media'>
                <div className='media-left'>
                  <CustomIcons imageUrl={publisherLogo} name={publisherName}/>
                </div>
                <div className='media-body'>
                  <h1>{this.props.distribution.title}</h1>
                  <div className='publisher'>{publisherName}</div>
                  <div className='updated-date'>Updated {this.props.distribution.updatedDate}</div>
                </div>
              </div>
            </div>

            <Tabs list={tabList} baseUrl={baseUrl}/>
            <div className='tab-content'>
              <Switch>
                <Route path='/dataset/:datasetId/distribution/:distributionId/details' component={DistributionDetails} />
                <Route path='/dataset/:datasetId/distribution/:distributionId/preview' component={DistributionPreview} />
                <Route path='/dataset/:datasetId/distribution/:distributionId/' component={DistributionDetails} />
              </Switch>
            </div>
            </div>
      )
    } else if(this.props.match.params.datasetId && !this.props.datasetIsFetching){
      if(this.props.datasetFetchError){
        return <ErrorHandler errorCode={this.props.datasetFetchError}/>;
      }
      const datasetTabs = [
        {id: 'details', name: 'Details', isActive: true},
        {id:  'discussion', name: 'Discussion', isActive: !config.disableAuthenticationFeatures},
        {id: 'publisher', name: 'About ' + publisherName, isActive: publisherId},
      ];

      const baseUrl = `/dataset/${encodeURIComponent(this.props.match.params.datasetId)}`;

      return (
        <div>
            <div className='container media'>
              {this.renderBreadCrumbs(this.props.dataset)}
              <div className='media-left'>
                <CustomIcons imageUrl={publisherLogo} name={publisherName}/>
              </div>
               <div className='media-body'>
                  <h1>{this.props.dataset.title}</h1>
                  <div className='publisher'>{publisherName}</div>
                  <div className='updated-date'>Updated {this.props.dataset.updatedDate}</div>
              </div>
            </div>

            <Tabs list={datasetTabs} baseUrl={baseUrl}/>
            <div className='tab-content'>
              <Switch>
                <Route path='/dataset/:datasetId/details' component={DatasetDetails} />
                <Route path='/dataset/:datasetId/discussion' component={DatasetDiscussion} />
                <Route path='/dataset/:datasetId/publisher' component={DatasetPublisher} />
                <Route path='/dataset/:datasetId/' component={DatasetDetails} />
              </Switch>
            </div>
        </div>
      );
    }

  }

  render() {
    const title = this.props.match.params.distributionId ? this.props.distribution.title : this.props.dataset.title;
    console.log(this.props.match);
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
